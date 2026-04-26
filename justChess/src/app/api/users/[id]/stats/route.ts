/**
 * GET /api/users/[id]/stats
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { userStats } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";
import { apiLimiter, withRateLimit } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;

  const stats = await db.query.userStats.findFirst({
    where: eq(userStats.userId, id),
  });

  if (!stats) return Errors.notFound("User stats");

  const winRate =
    stats.gamesPlayed > 0
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
      : 0;

  return ok({
    ratingRapid: stats.ratingRapid,
    ratingBlitz: stats.ratingBlitz,
    ratingBullet: stats.ratingBullet,
    ratingClassical: stats.ratingClassical,
    gamesPlayed: stats.gamesPlayed,
    gamesWon: stats.gamesWon,
    gamesLost: stats.gamesLost,
    gamesDrawn: stats.gamesDrawn,
    gamesAbandoned: stats.gamesAbandoned,
    currentWinStreak: stats.currentWinStreak,
    bestWinStreak: stats.bestWinStreak,
    currentDailyStreak: stats.currentDailyStreak,
    bestDailyStreak: stats.bestDailyStreak,
    winRate,
    aiGamesPlayed: stats.aiGamesPlayed,
    aiGamesWon: stats.aiGamesWon,
    lastGameAt: stats.lastGameAt?.toISOString() ?? null,
  });
}
