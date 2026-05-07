/**
 * GET /api/users/[id]/stats
 *
 * Aggregate stats are computed only from RATED and CASUAL games.
 * Games against AI and friendly matches (challenges between friends) are
 * tracked separately and are NOT counted in wins/losses/draws/win-rate.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { userStats, games } from "@/db/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
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
    const stats = await db.query.userStats.findFirst({
      where: eq(userStats.userId, id),
    });

    if (!stats) return Errors.notFound("User stats");

    // Compute counted stats from games table (rated + casual only).
    const [counted] = await db
      .select({
        gamesPlayed: sql<number>`count(*)::int`,
        gamesWon: sql<number>`count(*) filter (where (${games.whitePlayerId} = ${id} and ${games.result} = 'white_wins') or (${games.blackPlayerId} = ${id} and ${games.result} = 'black_wins'))::int`,
        gamesLost: sql<number>`count(*) filter (where (${games.whitePlayerId} = ${id} and ${games.result} = 'black_wins') or (${games.blackPlayerId} = ${id} and ${games.result} = 'white_wins'))::int`,
        gamesDrawn: sql<number>`count(*) filter (where ${games.result} = 'draw')::int`,
      })
      .from(games)
      .where(
        and(
          or(eq(games.whitePlayerId, id), eq(games.blackPlayerId, id)),
          eq(games.status, "completed"),
          inArray(games.gameType, ["rated", "casual"])
        )
      );

    const gamesPlayed = counted?.gamesPlayed ?? 0;
    const gamesWon = counted?.gamesWon ?? 0;
    const gamesLost = counted?.gamesLost ?? 0;
    const gamesDrawn = counted?.gamesDrawn ?? 0;

    const winRate =
      gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

    return ok({
      ratingRapid: stats.ratingRapid,
      ratingBlitz: stats.ratingBlitz,
      ratingBullet: stats.ratingBullet,
      ratingClassical: stats.ratingClassical,
      gamesPlayed,
      gamesWon,
      gamesLost,
      gamesDrawn,
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
  } catch (err) {
    console.error("[GET /api/users/[id]/stats]", err);
    return Errors.internal();
  }
}
