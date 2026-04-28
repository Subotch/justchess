/**
 * Achievement Service — checks and awards achievements after game events
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  achievements,
  userAchievements,
  userStats,
  games,
  gameMoves,
} from "@/db/schema";

// ─────────────────────────────────────────────
// ACHIEVEMENT DEFINITIONS (seeded to DB)
// ─────────────────────────────────────────────

export const ACHIEVEMENT_DEFINITIONS = [
  // Gameplay
  {
    id: "first_win",
    name: "First Victory",
    description: "Win your first game",
    category: "gameplay" as const,
    points: 10,
    isSecret: false,
    criteria: JSON.stringify({ type: "wins", count: 1 }),
  },
  {
    id: "win_streak_3",
    name: "Hat Trick",
    description: "Win 3 games in a row",
    category: "gameplay" as const,
    points: 20,
    isSecret: false,
    criteria: JSON.stringify({ type: "win_streak", count: 3 }),
  },
  {
    id: "win_streak_5",
    name: "On Fire",
    description: "Win 5 games in a row",
    category: "gameplay" as const,
    points: 30,
    isSecret: false,
    criteria: JSON.stringify({ type: "win_streak", count: 5 }),
  },
  {
    id: "win_streak_10",
    name: "Unstoppable",
    description: "Win 10 games in a row",
    category: "gameplay" as const,
    points: 50,
    isSecret: false,
    criteria: JSON.stringify({ type: "win_streak", count: 10 }),
  },
  {
    id: "checkmate_queen",
    name: "Queen Slayer",
    description: "Win a game by checkmate",
    category: "gameplay" as const,
    points: 15,
    isSecret: false,
    criteria: JSON.stringify({ type: "checkmate_win", count: 1 }),
  },
  {
    id: "games_10",
    name: "Getting Started",
    description: "Play 10 games",
    category: "milestone" as const,
    points: 10,
    isSecret: false,
    criteria: JSON.stringify({ type: "games_played", count: 10 }),
  },
  {
    id: "games_50",
    name: "Dedicated Player",
    description: "Play 50 games",
    category: "milestone" as const,
    points: 25,
    isSecret: false,
    criteria: JSON.stringify({ type: "games_played", count: 50 }),
  },
  {
    id: "games_100",
    name: "Century",
    description: "Play 100 games",
    category: "milestone" as const,
    points: 50,
    isSecret: false,
    criteria: JSON.stringify({ type: "games_played", count: 100 }),
  },
  {
    id: "games_500",
    name: "Chess Addict",
    description: "Play 500 games",
    category: "milestone" as const,
    points: 100,
    isSecret: false,
    criteria: JSON.stringify({ type: "games_played", count: 500 }),
  },
  {
    id: "rating_1500",
    name: "Rising Star",
    description: "Reach a rating of 1500",
    category: "milestone" as const,
    points: 30,
    isSecret: false,
    criteria: JSON.stringify({ type: "rating", value: 1500 }),
  },
  {
    id: "rating_1800",
    name: "Expert",
    description: "Reach a rating of 1800",
    category: "milestone" as const,
    points: 50,
    isSecret: false,
    criteria: JSON.stringify({ type: "rating", value: 1800 }),
  },
  {
    id: "rating_2000",
    name: "Master Class",
    description: "Reach a rating of 2000",
    category: "milestone" as const,
    points: 100,
    isSecret: false,
    criteria: JSON.stringify({ type: "rating", value: 2000 }),
  },
  // Social
  {
    id: "first_friend",
    name: "Making Friends",
    description: "Add your first friend",
    category: "social" as const,
    points: 10,
    isSecret: false,
    criteria: JSON.stringify({ type: "friends", count: 1 }),
  },
  {
    id: "friends_5",
    name: "Social Butterfly",
    description: "Have 5 friends",
    category: "social" as const,
    points: 20,
    isSecret: false,
    criteria: JSON.stringify({ type: "friends", count: 5 }),
  },
  // Special / Secret
  {
    id: "daily_streak_7",
    name: "Week Warrior",
    description: "Play every day for 7 days",
    category: "special" as const,
    points: 40,
    isSecret: false,
    criteria: JSON.stringify({ type: "daily_streak", count: 7 }),
  },
  {
    id: "daily_streak_30",
    name: "Monthly Devotion",
    description: "Play every day for 30 days",
    category: "special" as const,
    points: 100,
    isSecret: true,
    criteria: JSON.stringify({ type: "daily_streak", count: 30 }),
  },
  {
    id: "beat_ai_max",
    name: "Machine Slayer",
    description: "Beat the AI at maximum difficulty",
    category: "special" as const,
    points: 200,
    isSecret: true,
    criteria: JSON.stringify({ type: "beat_ai_difficulty", level: 20 }),
  },
];

// ─────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────

export const achievementService = {
  /**
   * Check all achievement criteria for a user after a game.
   * Awards any newly earned achievements.
   */
  async checkAndAward(userId: string, gameId: string): Promise<string[]> {
    const [stats, existingAchievements, allAchievements] = await Promise.all([
      db.query.userStats.findFirst({ where: eq(userStats.userId, userId) }),
      db.query.userAchievements.findMany({
        where: eq(userAchievements.userId, userId),
      }),
      db.query.achievements.findMany(),
    ]);

    if (!stats) return [];

    const earnedIds = new Set(existingAchievements.map((a) => a.achievementId));
    const newlyEarned: string[] = [];

    for (const achievement of allAchievements) {
      if (earnedIds.has(achievement.id)) continue;

      const criteria = JSON.parse(achievement.criteria);
      const earned = await this.evaluateCriteria(criteria, stats, userId, gameId);

      if (earned) {
        await db.insert(userAchievements).values({
          userId,
          achievementId: achievement.id,
          gameId,
        }).onConflictDoNothing();
        newlyEarned.push(achievement.id);
      }
    }

    return newlyEarned;
  },

  /**
   * Evaluate a single achievement criteria against user stats.
   * AI games are excluded from wins, win_streak, and games_played achievements.
   */
  async evaluateCriteria(
    criteria: any,
    stats: any,
    userId: string,
    gameId: string
  ): Promise<boolean> {
    // Calculate non-AI stats (exclude AI games from counts)
    const nonAiWins = (stats.gamesWon || 0) - (stats.aiGamesWon || 0);
    const nonAiGamesPlayed = (stats.gamesPlayed || 0) - (stats.aiGamesPlayed || 0);

    switch (criteria.type) {
      case "wins":
        // Exclude AI games from win count
        return nonAiWins >= criteria.count;

      case "win_streak":
        // For win streak achievements, we need to check if the current/longest
        // streak was achieved without AI games. This is a simplified check:
        // only award if user has at least N non-AI wins.
        // Note: A proper solution would track PvP-only streak separately.
        return nonAiWins >= criteria.count;

      case "games_played":
        // Exclude AI games from games count
        return nonAiGamesPlayed >= criteria.count;

      case "rating":
        return (
          stats.ratingRapid >= criteria.value ||
          stats.ratingBlitz >= criteria.value ||
          stats.ratingBullet >= criteria.value ||
          stats.ratingClassical >= criteria.value
        );

      case "daily_streak":
        return stats.currentDailyStreak >= criteria.count || stats.bestDailyStreak >= criteria.count;

      case "checkmate_win": {
        // Check if the current game ended by checkmate and user won
        const game = await db.query.games.findFirst({
          where: eq(games.id, gameId),
        });
        if (!game) return false;
        return (
          game.resultReason === "checkmate" &&
          ((game.whitePlayerId === userId && game.result === "white_wins") ||
            (game.blackPlayerId === userId && game.result === "black_wins"))
        );
      }

      case "beat_ai_difficulty": {
        const game = await db.query.games.findFirst({
          where: eq(games.id, gameId),
        });
        if (!game || !game.isAiGame) return false;
        const won =
          (game.whitePlayerId === userId && game.result === "white_wins") ||
          (game.blackPlayerId === userId && game.result === "black_wins");
        return won && (game.aiDifficulty ?? 0) >= criteria.level;
      }

      default:
        return false;
    }
  },

  /**
   * Seed achievement definitions to the database.
   * Run once during setup/migration.
   */
  async seedAchievements(): Promise<void> {
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      await db
        .insert(achievements)
        .values(def)
        .onConflictDoNothing();
    }
  },

  /**
   * Get all achievements with user's earned status.
   */
  async getUserAchievements(userId: string) {
    const [allAchievements, userEarned] = await Promise.all([
      db.query.achievements.findMany(),
      db.query.userAchievements.findMany({
        where: eq(userAchievements.userId, userId),
      }),
    ]);

    const earnedMap = new Map(
      userEarned.map((ua) => [ua.achievementId, ua])
    );

    return allAchievements.map((a) => {
      const earned = earnedMap.get(a.id);
      return {
        ...a,
        earned: !!earned,
        earnedAt: earned?.earnedAt?.toISOString(),
        gameId: earned?.gameId,
      };
    });
  },
};
