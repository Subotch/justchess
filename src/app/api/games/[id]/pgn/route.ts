/**
 * GET /api/games/[id]/pgn — get PGN for a completed game
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { games } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;

  try {
    const game = await db.query.games.findFirst({
      where: eq(games.id, id),
      with: {
        whitePlayer: { columns: { username: true, name: true } },
        blackPlayer: { columns: { username: true, name: true } },
      },
    });

    if (!game) return Errors.notFound("Game");
    if (!game.pgn) return Errors.notFound("PGN not available");

    // Return as plain text PGN
    const response = new Response(game.pgn, {
      headers: {
        "Content-Type": "application/x-chess-pgn",
        "Content-Disposition": `attachment; filename="game-${id}.pgn"`,
      },
    });

    return response;
  } catch (err) {
    console.error("[GET /api/games/[id]/pgn]", err);
    return Errors.internal();
  }
}
