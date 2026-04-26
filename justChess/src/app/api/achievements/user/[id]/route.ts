/**
 * GET /api/achievements/user/[id]
 */

import { NextRequest } from "next/server";
import { achievementService } from "@/services/achievement.service";
import { ok, Errors } from "@/lib/api-response";
import { apiLimiter, withRateLimit } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;

  const achievements = await achievementService.getUserAchievements(id);

  const earnedCount = achievements.filter((a) => a.earned).length;
  const totalPoints = achievements
    .filter((a) => a.earned)
    .reduce((sum, a) => sum + (a.points ?? 0), 0);

  return ok({
    achievements,
    totalPoints,
    earnedCount,
    totalCount: achievements.length,
  });
}
