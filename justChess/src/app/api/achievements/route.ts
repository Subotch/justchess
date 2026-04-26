/**
 * GET /api/achievements/list — all achievements
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { achievements } from "@/db/schema";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  try {
    const all = await db.query.achievements.findMany({
      orderBy: (a, { asc }) => [asc(a.category), asc(a.points)],
    });

    return ok(
      all.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.isSecret ? "???" : a.description,
        category: a.category,
        iconUrl: a.iconUrl ?? null,
        points: a.points,
        isSecret: a.isSecret,
      }))
    );
  } catch (err) {
    console.error("[GET /api/achievements]", err);
    return Errors.internal();
  }
}
