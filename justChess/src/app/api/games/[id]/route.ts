/**
 * GET /api/games/[id] — get game data
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
    const game = await gameService.getGame(id);
    if (!game) return Errors.notFound("Game");

    const timeMs = game.timeControlMinutes * 60 * 1000;

    return ok({
      id: game.id,
      status: game.status,
      gameType: game.gameType,
      timingCategory: game.timingCategory,
      timeControlMinutes: game.timeControlMinutes,
      incrementSeconds: game.incrementSeconds,
      white: {
        id: game.whitePlayerId ?? null,
        username: (game as any).whitePlayer?.username ?? null,
        name: (game as any).whitePlayer?.name ?? null,
        image: (game as any).whitePlayer?.image ?? null,
        rating: game.whiteRatingBefore ?? null,
        timeRemainingMs: game.whiteTimeRemainingMs ?? timeMs,
      },
      black: {
        id: game.blackPlayerId ?? null,
        username: (game as any).blackPlayer?.username ?? null,
        name: (game as any).blackPlayer?.name ?? null,
        image: (game as any).blackPlayer?.image ?? null,
        rating: game.blackRatingBefore ?? null,
        timeRemainingMs: game.blackTimeRemainingMs ?? timeMs,
      },
      fen: game.finalFen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      pgn: game.pgn ?? null,
      result: game.result,
      resultReason: game.resultReason ?? null,
      isAiGame: game.isAiGame,
      aiDifficulty: game.aiDifficulty ?? null,
      totalMoves: game.totalMoves,
      spectatorCount: game.peakSpectators,
      startedAt: game.startedAt?.toISOString() ?? null,
      endedAt: game.endedAt?.toISOString() ?? null,
      createdAt: game.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("[GET /api/games/[id]]", err);
    return Errors.internal();
  }
}
