/**
 * GET /api/games/[id]/moves
 * GET /api/games/[id]/pgn
 */

import { NextRequest } from "next/server";
import { gameService } from "@/services/game.service";
import { ok, Errors } from "@/lib/api-response";
import { apiLimiter, withRateLimit } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;
  const game = await gameService.getGame(id);
  if (!game) return Errors.notFound("Game");

  const moves = await gameService.getGameMoves(id);

  return ok({
    gameId: id,
    moves: moves.map((m) => ({
      moveNumber: m.moveNumber,
      color: m.color,
      san: m.san,
      uci: m.uci,
      fen: m.fen,
      timeSpentMs: m.timeSpentMs,
      clockRemainingMs: m.clockRemainingMs,
    })),
  });
}
