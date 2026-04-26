/**
 * GET /api/users/[id]/rating-history?timingCategory=rapid
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { ratingHistory, userStats } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";
import { apiLimiter, withRateLimit } from "@/lib/rate-limit";
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
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 200);

  const history = await db.query.ratingHistory.findMany({
    where: and(
      eq(ratingHistory.userId, id),
      eq(ratingHistory.timingCategory, timingCategory)
    ),
    orderBy: [desc(ratingHistory.createdAt)],
    limit,
  });

  if (!history.length) {
    // Return empty history with current rating
    const stats = await db.query.userStats.findFirst({
      where: eq(userStats.userId, id),
    });

    return ok({
      timingCategory,
      history: [],
      currentRating: stats?.ratingRapid ?? 1200,
      peakRating: stats?.ratingRapid ?? 1200,
      lowestRating: stats?.ratingRapid ?? 1200,
    });
  }

  const ratings = history.map((h) => h.ratingAfter);
  const currentRating = history[0].ratingAfter;
  const peakRating = Math.max(...ratings);
  const lowestRating = Math.min(...ratings);

  return ok({
    timingCategory,
    history: history.reverse().map((h) => ({
      date: h.createdAt.toISOString(),
      rating: h.ratingAfter,
      change: h.ratingChange,
      gameId: h.gameId,
    })),
    currentRating,
    peakRating,
    lowestRating,
  });
}
