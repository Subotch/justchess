/**
 * POST /api/games/[id]/move — make a move (REST fallback, primary path is Socket.IO)
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { gameService } from "@/services/game.service";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, moveLimiter } from "@/lib/rate-limit";
import { z } from "zod";

const moveSchema = z.object({
  from: z.string().length(2),
  to: z.string().length(2),
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, moveLimiter, (r) => {
    const ip = r.headers.get("x-forwarded-for") ?? "anon";
    return `move:${ip}`;
  });
  if (limited) return limited;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();

    const { id } = await params;
    const body = await req.json();
    const parsed = moveSchema.safeParse(body);
    if (!parsed.success) {
      return Errors.badRequest("Invalid move format");
    }

    const { from, to, promotion } = parsed.data;

    const result = await gameService.makeMove({
      gameId: id,
      userId: session.user.id,
      from,
      to,
      promotion,
    });

    if (!result.success) {
      return Errors.badRequest(result.error ?? "Illegal move");
    }

    // Broadcast via Socket.IO if available
    if (typeof global !== "undefined" && (global as any).io) {
      const io = (global as any).io;
      io.to(`game:room:${id}`).emit("game:move_made", {
        gameId: id,
        move: { san: result.san, uci: result.uci, fen: result.fen },
        fen: result.fen,
        pgn: result.pgn,
        currentTurn: result.fen!.split(" ")[1] === "w" ? "white" : "black",
        whiteTimeRemainingMs: 0,
        blackTimeRemainingMs: 0,
      });

      if (result.gameEnded) {
        io.to(`game:room:${id}`).emit("game:ended", {
          gameId: id,
          result: result.result,
          reason: result.resultReason,
          pgn: result.pgn,
          whiteRatingChange: result.whiteRatingChange,
          blackRatingChange: result.blackRatingChange,
        });
      }
    }

    return ok({
      move: {
        san: result.san!,
        uci: result.uci!,
        fen: result.fen!,
        moveNumber: 0,
        color: "white" as const,
      },
      fen: result.fen!,
      pgn: result.pgn!,
      isCheck: result.isCheck ?? false,
      isCheckmate: result.isCheckmate ?? false,
      isStalemate: result.isStalemate ?? false,
      isDraw: result.isDraw ?? false,
      gameEnded: result.gameEnded ?? false,
      result: result.result,
      resultReason: result.resultReason,
    });
  } catch (err) {
    console.error("[POST /api/games/[id]/move]", err);
    return Errors.internal();
  }
}
