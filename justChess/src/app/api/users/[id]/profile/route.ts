/**
 * GET  /api/users/[id]/profile  — public profile
 * PATCH /api/users/[id]/profile — update own profile
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, userStats, friendships, games } from "@/db/schema";
import { eq, or, and, desc } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";
import { apiLimiter, withRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const UpdateProfileSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  country: z.string().length(2).optional(),
  preferences: z.record(z.unknown()).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;

  const session = await auth.api.getSession({ headers: req.headers });

  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    with: { stats: true },
  });

  if (!user) return Errors.notFound("User");

  // Get recent games (last 5)
  const recentGames = await db.query.games.findMany({
    where: and(
      or(eq(games.whitePlayerId, id), eq(games.blackPlayerId, id)),
      eq(games.status, "completed")
    ),
    orderBy: [desc(games.endedAt)],
    limit: 5,
    with: {
      whitePlayer: { columns: { id: true, username: true, name: true, image: true } },
      blackPlayer: { columns: { id: true, username: true, name: true, image: true } },
    },
  });

  // Check friendship status if logged in
  let isFriend = false;
  let friendshipStatus = null;

  if (session?.user && session.user.id !== id) {
    const friendship = await db.query.friendships.findFirst({
      where: or(
        and(eq(friendships.requesterId, session.user.id), eq(friendships.addresseeId, id)),
        and(eq(friendships.requesterId, id), eq(friendships.addresseeId, session.user.id))
      ),
    });
    if (friendship) {
      isFriend = friendship.status === "accepted";
      friendshipStatus = friendship.status;
    }
  }

  return ok({
    id: user.id,
    username: user.username,
    name: user.name,
    image: user.image,
    bio: user.bio,
    country: user.country,
    isOnline: user.isOnline,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    stats: user.stats
      ? {
          ratingRapid: user.stats.ratingRapid,
          ratingBlitz: user.stats.ratingBlitz,
          ratingBullet: user.stats.ratingBullet,
          ratingClassical: user.stats.ratingClassical,
          gamesPlayed: user.stats.gamesPlayed,
          gamesWon: user.stats.gamesWon,
          gamesLost: user.stats.gamesLost,
          gamesDrawn: user.stats.gamesDrawn,
          currentWinStreak: user.stats.currentWinStreak,
          bestWinStreak: user.stats.bestWinStreak,
        }
      : null,
    recentGames,
    isFriend,
    friendshipStatus,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Errors.unauthorized();

  const { id } = await params;
  if (session.user.id !== id) return Errors.forbidden();

  const body = await req.json();
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.badRequest("Validation failed", parsed.error.flatten().fieldErrors as any);
  }

  const { username, name, bio, country, preferences } = parsed.data;

  // Check username uniqueness
  if (username) {
    const existing = await db.query.users.findFirst({
      where: eq(users.username, username),
    });
    if (existing && existing.id !== id) {
      return Errors.conflict("Username is already taken");
    }
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (username !== undefined) updateData.username = username;
  if (name !== undefined) updateData.name = name;
  if (bio !== undefined) updateData.bio = bio;
  if (country !== undefined) updateData.country = country;
  if (preferences !== undefined) {
    // Merge with existing preferences
    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    const existing = user?.preferences ? JSON.parse(user.preferences) : {};
    updateData.preferences = JSON.stringify({ ...existing, ...preferences });
  }

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning();

  return ok({
    id: updated.id,
    username: updated.username,
    name: updated.name,
    image: updated.image,
    bio: updated.bio,
    country: updated.country,
    preferences: updated.preferences ? JSON.parse(updated.preferences) : null,
  });
}
