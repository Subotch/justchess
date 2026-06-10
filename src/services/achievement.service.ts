/**
 * Achievement Service — checks and awards achievements after game events
 */

import { eq, and, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  achievements,
  userAchievements,
  userStats,
  games,
  gameMoves,
  playerGameStats,
} from "@/db/schema";

// ─────────────────────────────────────────────
// INTERNAL TYPES
// ─────────────────────────────────────────────

interface EvalContext {
  userId: string;
  game: NonNullable<Awaited<ReturnType<typeof db.query.games.findFirst>>>;
  stats: NonNullable<Awaited<ReturnType<typeof db.query.userStats.findFirst>>>;
  moveCount: number;
}

interface AchievementCriteria {
  type: string;
  count?: number;
  value?: number;
  level?: number;
  timingCategory?: string;
  ratingDiff?: number;
  opponentRating?: number;
  maxMoves?: number;
  ownTimeMs?: number;
  opponentTimeMs?: number;
  gameType?: string;
}

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
  // Additional gameplay achievements
  {
    id: "win_as_black",
    name: "Dark Horse",
    description: "Win a game playing as black",
    category: "gameplay" as const,
    points: 15,
    isSecret: false,
    criteria: JSON.stringify({ type: "win_as_black", count: 1 }),
  },
  {
    id: "wins_25",
    name: "Sharp Tactician",
    description: "Win 25 games",
    category: "gameplay" as const,
    points: 35,
    isSecret: false,
    criteria: JSON.stringify({ type: "wins", count: 25 }),
  },
  {
    id: "wins_50",
    name: "Veteran Player",
    description: "Win 50 games",
    category: "gameplay" as const,
    points: 60,
    isSecret: false,
    criteria: JSON.stringify({ type: "wins", count: 50 }),
  },
  {
    id: "wins_100",
    name: "Grand Master",
    description: "Win 100 games",
    category: "gameplay" as const,
    points: 100,
    isSecret: false,
    criteria: JSON.stringify({ type: "wins", count: 100 }),
  },
  {
    id: "win_bullet",
    name: "Lightning Reflexes",
    description: "Win a bullet game (< 3 min)",
    category: "gameplay" as const,
    points: 20,
    isSecret: false,
    criteria: JSON.stringify({ type: "win_timing", timingCategory: "bullet" }),
  },
  {
    id: "win_blitz",
    name: "Blitz King",
    description: "Win 10 blitz games",
    category: "gameplay" as const,
    points: 30,
    isSecret: false,
    criteria: JSON.stringify({ type: "win_timing", timingCategory: "blitz", count: 10 }),
  },
  {
    id: "win_classical",
    name: "Classical Scholar",
    description: "Win a classical game (> 30 min)",
    category: "gameplay" as const,
    points: 25,
    isSecret: false,
    criteria: JSON.stringify({ type: "win_timing", timingCategory: "classical" }),
  },
  // Additional milestone achievements
  {
    id: "games_1000",
    name: "Chess Grandmaster",
    description: "Play 1000 games",
    category: "milestone" as const,
    points: 200,
    isSecret: false,
    criteria: JSON.stringify({ type: "games_played", count: 1000 }),
  },
  {
    id: "rating_1300",
    name: "Improver",
    description: "Reach a rating of 1300",
    category: "milestone" as const,
    points: 15,
    isSecret: false,
    criteria: JSON.stringify({ type: "rating", value: 1300 }),
  },
  {
    id: "rating_2200",
    name: "Super Grandmaster",
    description: "Reach a rating of 2200",
    category: "milestone" as const,
    points: 150,
    isSecret: true,
    criteria: JSON.stringify({ type: "rating", value: 2200 }),
  },
  // Additional social achievements
  {
    id: "friends_10",
    name: "Popular",
    description: "Have 10 friends",
    category: "social" as const,
    points: 30,
    isSecret: false,
    criteria: JSON.stringify({ type: "friends", count: 10 }),
  },
  {
    id: "friendly_match",
    name: "Good Sport",
    description: "Play a friendly match against a friend",
    category: "social" as const,
    points: 15,
    isSecret: false,
    criteria: JSON.stringify({ type: "friendly_games", count: 1 }),
  },
  // Additional special achievements
  {
    id: "win_streak_20",
    name: "Legendary",
    description: "Win 20 games in a row",
    category: "special" as const,
    points: 150,
    isSecret: true,
    criteria: JSON.stringify({ type: "win_streak", count: 20 }),
  },
  {
    id: "daily_streak_3",
    name: "Getting into Habit",
    description: "Play every day for 3 days",
    category: "special" as const,
    points: 15,
    isSecret: false,
    criteria: JSON.stringify({ type: "daily_streak", count: 3 }),
  },
  {
    id: "daily_streak_14",
    name: "Two Week Streak",
    description: "Play every day for 14 days",
    category: "special" as const,
    points: 60,
    isSecret: false,
    criteria: JSON.stringify({ type: "daily_streak", count: 14 }),
  },
  {
    id: "ai_games_10",
    name: "Training Mode",
    description: "Play 10 games against AI",
    category: "gameplay" as const,
    points: 10,
    isSecret: false,
    criteria: JSON.stringify({ type: "ai_games_played", count: 10 }),
  },
  {
    id: "ai_wins_10",
    name: "AI Beater",
    description: "Win 10 games against AI",
    category: "gameplay" as const,
    points: 20,
    isSecret: false,
    criteria: JSON.stringify({ type: "ai_wins", count: 10 }),
  },
];

// ─────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────

export const achievementService = {
  /**
   * Check all achievement criteria for a user after a game.
   * Awards any newly earned achievements.
   * Game data is fetched ONCE and shared across all criteria checks.
   */
  async checkAndAward(userId: string, gameId: string): Promise<string[]> {
    // Fetch everything in parallel — one round-trip
    const [stats, existingAchievements, allAchievements, game, moves] =
      await Promise.all([
        db.query.userStats.findFirst({ where: eq(userStats.userId, userId) }),
        db.query.userAchievements.findMany({
          where: eq(userAchievements.userId, userId),
          columns: { achievementId: true },
        }),
        db.query.achievements.findMany(),
        db.query.games.findFirst({ where: eq(games.id, gameId) }),
        db.query.gameMoves.findMany({
          where: eq(gameMoves.gameId, gameId),
          columns: { id: true },
        }),
      ]);

    if (!stats || !game) return [];

    const earnedIds = new Set(existingAchievements.map((a) => a.achievementId));
    const newlyEarned: string[] = [];

    // Build shared context — avoids redundant per-criteria DB queries
    const ctx: EvalContext = { userId, game, stats, moveCount: moves.length };

    for (const achievement of allAchievements) {
      if (earnedIds.has(achievement.id)) continue;

      const criteria = JSON.parse(achievement.criteria) as AchievementCriteria;
      const earned = await this.evaluateCriteria(criteria, ctx);

      if (earned) {
        await db
          .insert(userAchievements)
          .values({ userId, achievementId: achievement.id, gameId })
          .onConflictDoNothing();
        newlyEarned.push(achievement.id);
      }
    }

    return newlyEarned;
  },

  /**
   * Evaluate a single achievement criteria.
   * Receives pre-fetched context — no extra DB calls unless criteria needs
   * aggregate counts (only those queries are deferred and cached lazily).
   */
  async evaluateCriteria(
    criteria: AchievementCriteria,
    ctx: EvalContext
  ): Promise<boolean> {
    const { userId, game, stats } = ctx;

    // Pre-computed aggregates — include ALL wins (PvP and AI)
    const nonAiWins = stats.gamesWon || 0;
    const nonAiGamesPlayed = stats.gamesPlayed || 0;

    // Helper: did the user win this specific game?
    const userWon =
      (game.whitePlayerId === userId && game.result === "white_wins") ||
      (game.blackPlayerId === userId && game.result === "black_wins");

    // Opponent stats snapshot (stored in game row — no extra query needed)
    const userIsWhite = game.whitePlayerId === userId;
    const opponentRatingSnapshot = userIsWhite
      ? (game.blackRatingBefore ?? 1200)
      : (game.whiteRatingBefore ?? 1200);
    const userRatingSnapshot = userIsWhite
      ? (game.whiteRatingBefore ?? 1200)
      : (game.blackRatingBefore ?? 1200);

    switch (criteria.type) {
      // ── Simple stat checks (no DB) ─────────────────────────────────────

      case "wins":
        return nonAiWins >= (criteria.count ?? 1);

      case "win_streak":
        return nonAiWins >= (criteria.count ?? 1);

      case "games_played":
        return nonAiGamesPlayed >= (criteria.count ?? 1);

      case "rating":
        return (
          stats.ratingRapid >= (criteria.value ?? 9999) ||
          stats.ratingBlitz >= (criteria.value ?? 9999) ||
          stats.ratingBullet >= (criteria.value ?? 9999) ||
          stats.ratingClassical >= (criteria.value ?? 9999)
        );

      case "daily_streak":
        return (
          stats.currentDailyStreak >= (criteria.count ?? 1) ||
          stats.bestDailyStreak >= (criteria.count ?? 1)
        );

      case "ai_games_played":
        return (stats.aiGamesPlayed || 0) >= (criteria.count ?? 1);

      case "ai_wins":
        return (stats.aiGamesWon || 0) >= (criteria.count ?? 1);

      // ── Current-game checks (uses pre-fetched game row) ────────────────

      case "checkmate_win":
        return userWon && game.resultReason === "checkmate";

      case "beat_ai_difficulty":
        return (
          game.isAiGame &&
          userWon &&
          (game.aiDifficulty ?? 0) >= (criteria.level ?? 20)
        );

      case "win_as_black":
        return game.blackPlayerId === userId && game.result === "black_wins";

      // ── Upset: beat or draw with opponent 400+ rating above user ───────
      case "upset_result": {
        const ratingDiff = opponentRatingSnapshot - userRatingSnapshot;
        if (ratingDiff < (criteria.ratingDiff ?? 400)) return false;
        if (game.isAiGame) return false;
        return userWon || game.result === "draw";
      }

      // ── Quick checkmate: win by checkmate in <= maxMoves against rated opp ─
      case "quick_checkmate": {
        if (!userWon || game.resultReason !== "checkmate") return false;
        // game.totalMoves counts half-moves (ply); multiply maxMoves * 2
        if ((game.totalMoves ?? 999) > (criteria.maxMoves ?? 15) * 2) return false;
        if (opponentRatingSnapshot < (criteria.opponentRating ?? 1400)) return false;
        return true;
      }

      // ── No piece loss win: win vs 1500+ without losing any piece
      // Simplified: we verify by checking materialAdvantageAtEnd > 0
      // (positive = user gained material; proxy for not losing pieces)
      case "no_piece_loss_win": {
        if (!userWon) return false;
        if (opponentRatingSnapshot < (criteria.opponentRating ?? 1500)) return false;
        const pgs = await db.query.playerGameStats.findFirst({
          where: and(
            eq(playerGameStats.gameId, game.id),
            eq(playerGameStats.userId, userId)
          ),
          columns: { materialAdvantageAtEnd: true },
        });
        // Require positive material advantage (user didn't bleed pieces)
        if (!pgs) return false;
        return (pgs.materialAdvantageAtEnd ?? -1) >= 0;
      }

      // ── Queen capture win: user won, keeping own queen while capturing opponent's ─
      // Heuristic: game ended by non-draw, user won, and opponent's final material
      // advantage is very negative (proxy). Real detection needs move-level data.
      // We use a lightweight PGN scan: check if opponent queen was captured (Q not in final FEN on their side)
      case "queen_capture_win": {
        if (!userWon || game.isAiGame) return false;
        const finalFen = game.finalFen ?? "";
        if (!finalFen) return false;
        // Parse piece section from FEN (before first space)
        const piecePart = finalFen.split(" ")[0] ?? "";
        // If user is white, opponent is black — black queen = 'q' (lowercase)
        // If user is black, opponent is white — white queen = 'Q' (uppercase)
        const opponentQueenChar = userIsWhite ? "q" : "Q";
        const userQueenChar = userIsWhite ? "Q" : "q";
        const opponentQueenGone = !piecePart.includes(opponentQueenChar);
        const userQueenPresent = piecePart.includes(userQueenChar);
        return opponentQueenGone && userQueenPresent;
      }

      // ── Zeitnot win: win with <30s when opponent had 2+ minutes ────────
      case "zeitnot_win": {
        if (!userWon || game.isAiGame) return false;
        if (opponentRatingSnapshot < (criteria.opponentRating ?? 1700)) return false;
        const userTimeLeft = userIsWhite
          ? game.whiteTimeRemainingMs
          : game.blackTimeRemainingMs;
        const oppTimeLeft = userIsWhite
          ? game.blackTimeRemainingMs
          : game.whiteTimeRemainingMs;
        if (userTimeLeft == null || oppTimeLeft == null) return false;
        return (
          userTimeLeft <= (criteria.ownTimeMs ?? 30_000) &&
          oppTimeLeft >= (criteria.opponentTimeMs ?? 120_000)
        );
      }

      // ── Aggregate counts (deferred DB queries) ─────────────────────────

      case "win_timing": {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(games)
          .where(
            and(
              or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)),
              eq(games.status, "completed"),
              eq(games.timingCategory, criteria.timingCategory as any),
              or(
                and(eq(games.whitePlayerId, userId), eq(games.result, "white_wins")),
                and(eq(games.blackPlayerId, userId), eq(games.result, "black_wins"))
              )
            )
          );
        return (row?.count ?? 0) >= (criteria.count ?? 1);
      }

      case "friendly_games": {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(games)
          .where(
            and(
              or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)),
              eq(games.status, "completed"),
              eq(games.gameType, "friendly")
            )
          );
        return (row?.count ?? 0) >= (criteria.count ?? 1);
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
    let [allAchievements, userEarned] = await Promise.all([
      db.query.achievements.findMany(),
      db.query.userAchievements.findMany({
        where: eq(userAchievements.userId, userId),
      }),
    ]);

    // Если таблица достижений пуста — засидить из определений кода
    if (allAchievements.length === 0) {
      await db
        .insert(achievements)
        .values(
          ACHIEVEMENT_DEFINITIONS.map((d) => ({
            id: d.id,
            name: d.name,
            description: d.description,
            category: d.category,
            points: d.points,
            isSecret: d.isSecret,
            criteria: d.criteria,
          }))
        )
        .onConflictDoNothing();
      allAchievements = await db.query.achievements.findMany();
    }

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
