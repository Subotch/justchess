/**
 * GET /api/achievements/user/[id] — achievements for a specific user
 */

import { NextRequest } from "next/server";
import { achievementService } from "@/services/achievement.service";
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
    const achievements = await achievementService.getUserAchievements(id);

    const earned = achievements.filter((a) => a.earned);
    const totalPoints = earned.reduce((sum, a) => sum + a.points, 0);

    return ok({
      achievements: achievements.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.isSecret && !a.earned ? "???" : a.description,
        category: a.category,
        iconUrl: a.iconUrl ?? null,
        points: a.points,
        isSecret: a.isSecret,
        earned: a.earned,
        earnedAt: a.earnedAt ?? null,
        gameId: a.gameId ?? null,
      })),
      totalPoints,
      earnedCount: earned.length,
      totalCount: achievements.length,
    });
  } catch (err) {
    console.error("[GET /api/achievements/user/[id]]", err);
    return Errors.internal();
  }
}
