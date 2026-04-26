/**
 * GET /api/games/[id]/moves — get all moves for a game
 */

import { NextRequest } from "next/server";
import { gameService } from "@/services/game.service";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;

  try {
    const moves = await gameService.getGameMoves(id);

    return ok({
      gameId: id,
      moves: moves.map((m) => ({
        moveNumber: m.moveNumber,
        color: m.color,
        san: m.san,
        uci: m.uci,
        fen: m.fen,
        timeSpentMs: m.timeSpentMs ?? null,
        clockRemainingMs: m.clockRemainingMs ?? null,
        evalCp: m.evalCp ?? null,
      })),
    });
  } catch (err) {
    console.error("[GET /api/games/[id]/moves]", err);
    return Errors.internal();
  }
}
