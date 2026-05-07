/**
 * GET /api/users/search?friendCode=XXXXXXXX
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { users, userStats } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();

    const { searchParams } = new URL(req.url);
    const friendCode = searchParams.get("friendCode");

    if (!friendCode) {
      return Errors.badRequest("friendCode parameter is required");
    }

    const user = await db.query.users.findFirst({
      where: eq(users.friendCode, friendCode.trim().toUpperCase()),
      with: {
        stats: {
          columns: {
            ratingRapid: true,
            ratingBlitz: true,
            ratingBullet: true,
            gamesPlayed: true,
            gamesWon: true,
          },
        },
      },
    });

    if (!user) {
      return Errors.notFound("User with this friend code");
    }

    return ok({
      id: user.id,
      username: user.username,
      friendCode: user.friendCode,
      name: user.name,
      image: user.image,
      isOnline: user.isOnline,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      stats: user.stats
        ? {
            ratingRapid: user.stats.ratingRapid,
            ratingBlitz: user.stats.ratingBlitz,
            ratingBullet: user.stats.ratingBullet,
            gamesPlayed: user.stats.gamesPlayed,
            gamesWon: user.stats.gamesWon,
          }
        : null,
    });
  } catch (err) {
    console.error("[GET /api/users/search]", err);
    return Errors.internal();
  }
}
