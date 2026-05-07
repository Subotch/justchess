/**
 * /profile/[id] — RSC: загружает данные профиля напрямую из БД,
 * передаёт в клиентский ProfileClientShell.
 */

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, userStats, friendships, games } from "@/db/schema";
import { eq, or, and, desc, inArray, sql } from "drizzle-orm";
import { ProfileClientShell } from "./ProfileClientShell";
import type { UserProfileResponse } from "@/types/api";

interface ProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { id } = await params;

  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    with: { stats: true },
  });

  if (!user) {
    notFound();
  }

  const stats = (user as any).stats ?? null;

  // Aggregate rated+casual stats
  let countedAggregate = { gamesPlayed: 0, gamesWon: 0, gamesLost: 0, gamesDrawn: 0 };
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

  // Recent games (last 5)
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

  // Play time
  const [playTimeRow] = await db
    .select({
      totalMinutes: sql<number>`coalesce(sum(extract(epoch from (${games.endedAt} - ${games.startedAt})) / 60)::int, 0)`,
    })
    .from(games)
    .where(
      and(
        or(eq(games.whitePlayerId, id), eq(games.blackPlayerId, id)),
        eq(games.status, "completed")
      )
    );
  const totalPlayTimeMinutes = playTimeRow?.totalMinutes ?? 0;

  // Friendship status (server-side: auth session)
  let isFriend = false;
  let friendshipStatus: string | null = null;

  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
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

  const profile: UserProfileResponse = {
    id: user.id,
    username: user.username ?? null,
    friendCode: user.friendCode,
    name: user.name,
    image: user.image ?? null,
    bio: user.bio ?? null,
    country: user.country ?? null,
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
      const opponent = isWhite ? (g as any).blackPlayer : (g as any).whitePlayer;
      return {
        id: g.id,
        opponent: opponent
          ? { id: opponent.id, username: opponent.username, name: opponent.name, image: opponent.image, rating: 1200 }
          : null,
        color: (isWhite ? "white" : "black") as "white" | "black",
        result: g.result,
        resultReason: g.resultReason ?? undefined,
        gameType: g.gameType,
        timingCategory: g.timingCategory,
        timeControlMinutes: g.timeControlMinutes,
        incrementSeconds: g.incrementSeconds,
        totalMoves: g.totalMoves,
        isAiGame: g.isAiGame,
        aiDifficulty: g.aiDifficulty ?? undefined,
        startedAt: g.startedAt?.toISOString() ?? undefined,
        endedAt: g.endedAt?.toISOString() ?? undefined,
        createdAt: g.createdAt.toISOString(),
      };
    }),
    isFriend,
    friendshipStatus: (friendshipStatus as "pending" | "accepted" | "rejected" | "blocked" | null) ?? null,
  };

  return <ProfileClientShell userId={id} initialProfile={profile} />;
}
