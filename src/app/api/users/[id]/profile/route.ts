/**
 * GET  /api/users/[id]/profile — public profile
 * PATCH /api/users/[id]/profile — update own profile
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { users, userStats, friendships, games } from "@/db/schema";
import { eq, or, and, desc, inArray, sql } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import type { UpdateProfileRequest } from "@/types/api";

const updateSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  country: z.string().length(2).optional(),
  image: z.string().url().optional(),
  preferences: z.record(z.unknown()).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });

    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      with: { stats: true },
    });

    if (!user) return Errors.notFound("User");

    const stats = user.stats;

    // Compute rated+casual aggregates (exclude AI and friendly).
    let countedAggregate: {
      gamesPlayed: number;
      gamesWon: number;
      gamesLost: number;
      gamesDrawn: number;
    } | null = null;
    if (stats) {
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
      countedAggregate = {
        gamesPlayed: counted?.gamesPlayed ?? 0,
        gamesWon: counted?.gamesWon ?? 0,
        gamesLost: counted?.gamesLost ?? 0,
        gamesDrawn: counted?.gamesDrawn ?? 0,
      };
    }

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
    let friendshipStatus: string | null = null;

    if (session?.user && session.user.id !== id) {
      const friendship = await db.query.friendships.findFirst({
        where: or(
          and(eq(friendships.requesterId, session.user.id), eq(friendships.addresseeId, id)),
          and(eq(friendships.requesterId, id), eq(friendships.addresseeId, session.user.id))
        ),
      });
      if (friendship) {
        friendshipStatus = friendship.status;
        isFriend = friendship.status === "accepted";
      }
    }

    // Compute total play time in minutes from all completed games
    const [playTimeRow] = await db
      .select({
        totalMinutes: sql<number>`
          coalesce(
            sum(
              extract(epoch from (${games.endedAt} - ${games.startedAt})) / 60
            )::int,
            0
          )`,
      })
      .from(games)
      .where(
        and(
          or(eq(games.whitePlayerId, id), eq(games.blackPlayerId, id)),
          eq(games.status, "completed")
        )
      );
    const totalPlayTimeMinutes = playTimeRow?.totalMinutes ?? 0;

    return ok({
      id: user.id,
      username: user.username,
      friendCode: user.friendCode,
      name: user.name,
      image: user.image,
      bio: user.bio,
      country: user.country,
      isOnline: user.isOnline,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      stats:
        stats && countedAggregate
          ? {
              ratingRapid: stats.ratingRapid,
              ratingBlitz: stats.ratingBlitz,
              ratingBullet: stats.ratingBullet,
              ratingClassical: stats.ratingClassical,
              gamesPlayed: countedAggregate.gamesPlayed,
              gamesWon: countedAggregate.gamesWon,
              gamesLost: countedAggregate.gamesLost,
              gamesDrawn: countedAggregate.gamesDrawn,
              currentWinStreak: stats.currentWinStreak,
              bestWinStreak: stats.bestWinStreak,
              totalPlayTimeMinutes,
            }
          : null,
      recentGames: recentGames.map((g) => {
        const isWhite = g.whitePlayerId === id;
        const opponent = isWhite ? g.blackPlayer : g.whitePlayer;
        return {
          id: g.id,
          opponent: opponent
            ? { id: opponent.id, username: opponent.username, name: opponent.name, image: opponent.image, rating: 1200 }
            : null,
          color: isWhite ? "white" : "black",
          result: g.result,
          resultReason: g.resultReason,
          gameType: g.gameType,
          timingCategory: g.timingCategory,
          timeControlMinutes: g.timeControlMinutes,
          incrementSeconds: g.incrementSeconds,
          totalMoves: g.totalMoves,
          isAiGame: g.isAiGame,
          aiDifficulty: g.aiDifficulty,
          startedAt: g.startedAt?.toISOString(),
          endedAt: g.endedAt?.toISOString(),
          createdAt: g.createdAt.toISOString(),
        };
      }),
      isFriend,
      friendshipStatus,
    });
  } catch (err) {
    console.error("[GET /api/users/[id]/profile]", err);
    return Errors.internal();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();
    if (session.user.id !== id) return Errors.forbidden();

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return Errors.badRequest("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const { username, name, bio, country, image, preferences } = parsed.data;

    // Check username uniqueness
    if (username) {
      const existing = await db.query.users.findFirst({
        where: eq(users.username, username),
      });
      if (existing && existing.id !== id) {
        return Errors.conflict("Username already taken");
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (username !== undefined) updateData.username = username;
    if (name !== undefined) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    if (country !== undefined) updateData.country = country;
    if (image !== undefined) updateData.image = image;
    if (preferences !== undefined) {
      // Merge with existing preferences
      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      const existing = user?.preferences ?? {};
      updateData.preferences = { ...existing, ...preferences };
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
    });
  } catch (err) {
    console.error("[PATCH /api/users/[id]/profile]", err);
    return Errors.internal();
  }
}
