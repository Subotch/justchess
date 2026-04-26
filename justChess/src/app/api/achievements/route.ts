/**
 * GET /api/achievements — all achievements
 * GET /api/achievements/user/[id] — user achievements
 */

import { NextRequest } from "next/server";
import { achievementService } from "@/services/achievement.service";
import { ok } from "@/lib/api-response";
import { apiLimiter, withRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { db } = await import("@/db");
  const { achievements } = await import("@/db/schema");

  const all = await db.query.achievements.findMany();

  return ok(all);
}
