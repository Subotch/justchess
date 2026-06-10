import { NextRequest } from "next/server";
import { db } from "@/db";
import { userStats, users } from "@/db/schema";
import { and, gt, desc, sql, isNotNull } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter } from "@/lib/rate-limit";

type LeaderboardEntry = {
  userId: string;
  username: string | null;
  name: string;
  image: string | null;
  rating: number;
  gamesPlayed: number;
};

type CategoryLeaderboard = {
  bullet: LeaderboardEntry[];
  blitz: LeaderboardEntry[];
  rapid: LeaderboardEntry[];
  classical: LeaderboardEntry[];
  average: LeaderboardEntry[];
  total: LeaderboardEntry[];
};

async function getTopPlayers(
  ratingField: "ratingBullet" | "ratingBlitz" | "ratingRapid" | "ratingClassical",
  minRating = 1200,
  limit = 10
) {
  const rows = await db
    .select({
      userId: userStats.userId,
      username: users.username,
      name: users.name,
      image: users.image,
      rating: userStats[ratingField],
      gamesPlayed: userStats.gamesPlayed,
    })
    .from(userStats)
    .innerJoin(users, sql`${userStats.userId} = ${users.id}`)
    .where(and(gt(userStats[ratingField], minRating), isNotNull(users.name)))
    .orderBy(desc(userStats[ratingField]))
    .limit(limit);

  return rows.map((row) => ({
    userId: row.userId,
    username: row.username,
    name: row.name,
    image: row.image,
    rating: row.rating,
    gamesPlayed: row.gamesPlayed ?? 0,
  }));
}

async function getTotalRatingLeaderboard(limit = 10) {
  // Суммарный рейтинг = пуля + блиц + рапид + классика
  const rows = await db
    .select({
      userId: userStats.userId,
      username: users.username,
      name: users.name,
      image: users.image,
      ratingBullet: userStats.ratingBullet,
      ratingBlitz: userStats.ratingBlitz,
      ratingRapid: userStats.ratingRapid,
      ratingClassical: userStats.ratingClassical,
      gamesPlayed: userStats.gamesPlayed,
    })
    .from(userStats)
    .innerJoin(users, sql`${userStats.userId} = ${users.id}`)
    .where(
      and(
        sql`(${userStats.ratingBullet} + ${userStats.ratingBlitz} + ${userStats.ratingRapid} + ${userStats.ratingClassical}) > ${4800}`,
        isNotNull(users.name)
      )
    )
    .orderBy(
      desc(
        sql`${userStats.ratingBullet} + ${userStats.ratingBlitz} + ${userStats.ratingRapid} + ${userStats.ratingClassical}`
      )
    )
    .limit(limit);

  return rows.map((row) => {
    const total = row.ratingBullet + row.ratingBlitz + row.ratingRapid + row.ratingClassical;
    return {
      userId: row.userId,
      username: row.username,
      name: row.name,
      image: row.image,
      rating: total,
      gamesPlayed: row.gamesPlayed ?? 0,
    };
  });
}

async function getAverageRatingLeaderboard(limit = 10) {
  // Средний рейтинг = (пуля + блиц + рапид + классика) / 4
  const rows = await db
    .select({
      userId: userStats.userId,
      username: users.username,
      name: users.name,
      image: users.image,
      ratingBullet: userStats.ratingBullet,
      ratingBlitz: userStats.ratingBlitz,
      ratingRapid: userStats.ratingRapid,
      ratingClassical: userStats.ratingClassical,
      gamesPlayed: userStats.gamesPlayed,
    })
    .from(userStats)
    .innerJoin(users, sql`${userStats.userId} = ${users.id}`)
    .where(
      and(
        sql`(${userStats.ratingBullet} + ${userStats.ratingBlitz} + ${userStats.ratingRapid} + ${userStats.ratingClassical}) / 4.0 > ${1200}`,
        isNotNull(users.name)
      )
    )
    .orderBy(
      desc(
        sql`(${userStats.ratingBullet} + ${userStats.ratingBlitz} + ${userStats.ratingRapid} + ${userStats.ratingClassical}) / 4.0`
      )
    )
    .limit(limit);

  return rows.map((row) => {
    const avg = Math.round(
      (row.ratingBullet + row.ratingBlitz + row.ratingRapid + row.ratingClassical) / 4
    );
    return {
      userId: row.userId,
      username: row.username,
      name: row.name,
      image: row.image,
      rating: avg,
      gamesPlayed: row.gamesPlayed ?? 0,
    };
  });
}

export async function GET(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  try {
    const [bullet, blitz, rapid, classical, average, total] = await Promise.all([
      getTopPlayers("ratingBullet"),
      getTopPlayers("ratingBlitz"),
      getTopPlayers("ratingRapid"),
      getTopPlayers("ratingClassical"),
      getAverageRatingLeaderboard(),
      getTotalRatingLeaderboard(),
    ]);

    return ok({
      bullet,
      blitz,
      rapid,
      classical,
      average,
      total,
    } satisfies CategoryLeaderboard);
  } catch (err) {
    console.error("[GET /api/leaderboard]", err);
    return Errors.internal();
  }
}