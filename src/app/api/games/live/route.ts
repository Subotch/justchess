/**
 * GET /api/games/live — list active games for spectators
 */

import { NextRequest } from "next/server";
import { gameService } from "@/services/game.service";
import { ok } from "@/lib/api-response";
import { apiLimiter, withRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20"));

  const liveGames = await gameService.getLiveGames(limit);

  return ok(
    liveGames.map((g) => ({
      id: g.id,
      white: {
        username: (g as any).whitePlayer?.username ?? "Anonymous",
        rating: g.whiteRatingBefore ?? 1200,
      },
      black: {
        username: (g as any).blackPlayer?.username ?? "Anonymous",
        rating: g.blackRatingBefore ?? 1200,
      },
      timingCategory: g.timingCategory,
      timeControlMinutes: g.timeControlMinutes,
      moveCount: g.totalMoves,
      spectatorCount: g.peakSpectators,
      startedAt: g.startedAt?.toISOString() ?? new Date().toISOString(),
    }))
  );
}
