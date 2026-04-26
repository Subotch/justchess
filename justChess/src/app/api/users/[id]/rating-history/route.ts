/**
 * GET /api/users/[id]/rating-history?timingCategory=rapid
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { ratingHistory, userStats } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter } from "@/lib/rate-limit";
import type { TimingCategory } from "@/types/game";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const timingCategory = (searchParams.get("timingCategory") ?? "rapid") as TimingCategory;

  try {
    const [history, stats] = await Promise.all([
      db.query.ratingHistory.findMany({
        where: and(
          eq(ratingHistory.userId, id),
          eq(ratingHistory.timingCategory, timingCategory)
        ),
        orderBy: [desc(ratingHistory.createdAt)],
        limit: 100,
      }),
      db.query.userStats.findFirst({ where: eq(userStats.userId, id) }),
    ]);

    if (!stats) return Errors.notFound("User");

    const currentRating = (() => {
      switch (timingCategory) {
        case "bullet": return stats.ratingBullet;
        case "blitz": return stats.ratingBlitz;
        case "rapid": return stats.ratingRapid;
        case "classical": return stats.ratingClassical;
        default: return stats.ratingRapid;
      }
    })();

    const ratings = history.map((h) => h.ratingAfter);
    const peakRating = ratings.length > 0 ? Math.max(...ratings) : currentRating;
    const lowestRating = ratings.length > 0 ? Math.min(...ratings) : currentRating;

    return ok({
      timingCategory,
      history: history.map((h) => ({
        date: h.createdAt.toISOString(),
        rating: h.ratingAfter,
        change: h.ratingChange,
        gameId: h.gameId ?? null,
      })),
      currentRating,
      peakRating,
      lowestRating,
    });
  } catch (err) {
    console.error("[GET /api/users/[id]/rating-history]", err);
    return Errors.internal();
  }
}
