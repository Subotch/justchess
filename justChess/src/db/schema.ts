/**
 * Drizzle ORM Schema — Just Chess
 *
 * Tables:
 *  users, user_stats, rating_history, friendships,
 *  games, game_moves, achievements, user_achievements,
 *  player_game_stats, user_daily_stats
 *
 * Better-Auth required tables are also included:
 *  sessions, accounts, verifications
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export const gameTypeEnum = pgEnum("game_type", [
  "rated",
  "casual",
  "ai",
  "tournament",
  "friendly",
]);

export const gameResultEnum = pgEnum("game_result", [
  "white_wins",
  "black_wins",
  "draw",
  "abandoned",
  "in_progress",
]);

export const gameResultReasonEnum = pgEnum("game_result_reason", [
  "checkmate",
  "resignation",
  "timeout",
  "stalemate",
  "insufficient_material",
  "threefold_repetition",
  "fifty_move_rule",
  "agreement",
  "abandoned",
]);

export const friendshipStatusEnum = pgEnum("friendship_status", [
  "pending",
  "accepted",
  "rejected",
  "blocked",
]);

export const achievementCategoryEnum = pgEnum("achievement_category", [
  "gameplay",
  "social",
  "milestone",
  "special",
]);

export const timingCategoryEnum = pgEnum("timing_category", [
  "bullet",   // < 3 min
  "blitz",    // 3–10 min
  "rapid",    // 10–30 min
  "classical", // > 30 min
  "correspondence",
]);

// ─────────────────────────────────────────────
// BETTER-AUTH TABLES
// ─────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Chess-specific profile fields
    username: varchar("username", { length: 30 }).unique(),
    friendCode: varchar("friend_code", { length: 8 }).notNull().unique(),
    bio: text("bio"),
    country: varchar("country", { length: 2 }), // ISO 3166-1 alpha-2
    isOnline: boolean("is_online").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Preferences stored as JSON text
    preferences: text("preferences").default('{"theme":"system","boardTheme":"classic","pieceSet":"standard","soundEnabled":true,"showCoordinates":true,"autoPromoteToQueen":false}'),
  },
  (t) => [
    index("users_email_idx").on(t.email),
    index("users_username_idx").on(t.username),
    index("users_is_online_idx").on(t.isOnline),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_token_idx").on(t.token),
  ]
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    unique("accounts_provider_account_unique").on(t.providerId, t.accountId),
  ]
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)]
);

// ─────────────────────────────────────────────
// USER STATS
// ─────────────────────────────────────────────

export const userStats = pgTable(
  "user_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),

    // Ratings per time control
    ratingRapid: integer("rating_rapid").notNull().default(1200),
    ratingBlitz: integer("rating_blitz").notNull().default(1200),
    ratingBullet: integer("rating_bullet").notNull().default(1200),
    ratingClassical: integer("rating_classical").notNull().default(1200),

    // Aggregate counts
    gamesPlayed: integer("games_played").notNull().default(0),
    gamesWon: integer("games_won").notNull().default(0),
    gamesLost: integer("games_lost").notNull().default(0),
    gamesDrawn: integer("games_drawn").notNull().default(0),
    gamesAbandoned: integer("games_abandoned").notNull().default(0),

    // Streaks
    currentWinStreak: integer("current_win_streak").notNull().default(0),
    bestWinStreak: integer("best_win_streak").notNull().default(0),
    currentDailyStreak: integer("current_daily_streak").notNull().default(0),
    bestDailyStreak: integer("best_daily_streak").notNull().default(0),

    // Puzzle stats
    puzzleRating: integer("puzzle_rating").notNull().default(1200),
    puzzlesSolved: integer("puzzles_solved").notNull().default(0),

    // AI stats
    aiGamesPlayed: integer("ai_games_played").notNull().default(0),
    aiGamesWon: integer("ai_games_won").notNull().default(0),

    // Timestamps
    lastGameAt: timestamp("last_game_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_stats_rating_rapid_idx").on(t.ratingRapid),
    index("user_stats_rating_blitz_idx").on(t.ratingBlitz),
    index("user_stats_rating_bullet_idx").on(t.ratingBullet),
  ]
);

// ─────────────────────────────────────────────
// RATING HISTORY
// ─────────────────────────────────────────────

export const ratingHistory = pgTable(
  "rating_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: uuid("game_id").references(() => games.id, {
      onDelete: "set null",
    }),
    timingCategory: timingCategoryEnum("timing_category").notNull(),
    ratingBefore: integer("rating_before").notNull(),
    ratingAfter: integer("rating_after").notNull(),
    ratingChange: integer("rating_change").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("rating_history_user_id_idx").on(t.userId),
    index("rating_history_user_timing_idx").on(t.userId, t.timingCategory),
    index("rating_history_created_at_idx").on(t.createdAt),
  ]
);

// ─────────────────────────────────────────────
// FRIENDSHIPS
// ─────────────────────────────────────────────

export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: friendshipStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Prevent duplicate friendship requests
    unique("friendships_pair_unique").on(t.requesterId, t.addresseeId),
    index("friendships_requester_idx").on(t.requesterId),
    index("friendships_addressee_idx").on(t.addresseeId),
    index("friendships_status_idx").on(t.status),
  ]
);

// ─────────────────────────────────────────────
// GAMES
// ─────────────────────────────────────────────

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Players
    whitePlayerId: text("white_player_id").references(() => users.id, {
      onDelete: "set null",
    }),
    blackPlayerId: text("black_player_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // AI game fields
    isAiGame: boolean("is_ai_game").notNull().default(false),
    aiDifficulty: smallint("ai_difficulty"), // 1–20 (ELO mapped)
    aiColor: varchar("ai_color", { length: 5 }), // 'white' | 'black'

    // Game type & timing
    gameType: gameTypeEnum("game_type").notNull().default("casual"),
    timingCategory: timingCategoryEnum("timing_category").notNull().default("rapid"),
    timeControlMinutes: smallint("time_control_minutes").notNull().default(10),
    incrementSeconds: smallint("increment_seconds").notNull().default(0),

    // State
    result: gameResultEnum("result").notNull().default("in_progress"),
    resultReason: gameResultReasonEnum("result_reason"),
    status: varchar("status", { length: 20 }).notNull().default("waiting"),
    // waiting | active | paused | completed | abandoned

    // Chess data
    pgn: text("pgn"),
    finalFen: text("final_fen"),
    openingName: varchar("opening_name", { length: 100 }),
    openingEco: varchar("opening_eco", { length: 5 }),

    // Time tracking (milliseconds remaining at game end)
    whiteTimeRemainingMs: integer("white_time_remaining_ms"),
    blackTimeRemainingMs: integer("black_time_remaining_ms"),

    // Move counts
    totalMoves: smallint("total_moves").notNull().default(0),

    // Ratings at time of game (snapshot)
    whiteRatingBefore: integer("white_rating_before"),
    blackRatingBefore: integer("black_rating_before"),
    whiteRatingAfter: integer("white_rating_after"),
    blackRatingAfter: integer("black_rating_after"),

    // Spectator count peak
    peakSpectators: smallint("peak_spectators").notNull().default(0),

    // Draw offer state
    drawOfferedBy: varchar("draw_offered_by", { length: 5 }), // 'white' | 'black'

    // Timestamps
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("games_white_player_idx").on(t.whitePlayerId),
    index("games_black_player_idx").on(t.blackPlayerId),
    index("games_status_idx").on(t.status),
    index("games_result_idx").on(t.result),
    index("games_game_type_idx").on(t.gameType),
    index("games_timing_category_idx").on(t.timingCategory),
    index("games_created_at_idx").on(t.createdAt),
    // Composite for "live games" query
    index("games_status_created_at_idx").on(t.status, t.createdAt),
  ]
);

// ─────────────────────────────────────────────
// GAME MOVES
// ─────────────────────────────────────────────

export const gameMoves = pgTable(
  "game_moves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    moveNumber: smallint("move_number").notNull(),
    color: varchar("color", { length: 5 }).notNull(), // 'white' | 'black'

    // Move notation
    san: varchar("san", { length: 10 }).notNull(),   // Standard Algebraic Notation e.g. "Nf3"
    uci: varchar("uci", { length: 5 }).notNull(),    // UCI format e.g. "g1f3"
    fen: text("fen").notNull(),                       // FEN after this move

    // Clock
    timeSpentMs: integer("time_spent_ms"),
    clockRemainingMs: integer("clock_remaining_ms"),

    // Engine evaluation (optional, for analysis)
    evalCp: integer("eval_cp"),       // centipawns
    evalDepth: smallint("eval_depth"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("game_moves_game_id_idx").on(t.gameId),
    // Composite for ordered move retrieval
    index("game_moves_game_move_number_idx").on(t.gameId, t.moveNumber),
    unique("game_moves_game_move_color_unique").on(
      t.gameId,
      t.moveNumber,
      t.color
    ),
  ]
);

// ─────────────────────────────────────────────
// ACHIEVEMENTS
// ─────────────────────────────────────────────

export const achievements = pgTable(
  "achievements",
  {
    id: varchar("id", { length: 50 }).primaryKey(), // e.g. "first_win", "win_streak_10"
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description").notNull(),
    category: achievementCategoryEnum("category").notNull(),
    iconUrl: text("icon_url"),
    points: smallint("points").notNull().default(10),
    isSecret: boolean("is_secret").notNull().default(false),
    // JSON criteria for server-side evaluation
    criteria: text("criteria").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("achievements_category_idx").on(t.category)]
);

export const userAchievements = pgTable(
  "user_achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementId: varchar("achievement_id", { length: 50 })
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    gameId: uuid("game_id").references(() => games.id, {
      onDelete: "set null",
    }),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("user_achievements_unique").on(t.userId, t.achievementId),
    index("user_achievements_user_id_idx").on(t.userId),
    index("user_achievements_earned_at_idx").on(t.earnedAt),
  ]
);

// ─────────────────────────────────────────────
// PLAYER GAME STATS (per-game detailed stats)
// ─────────────────────────────────────────────

export const playerGameStats = pgTable(
  "player_game_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    color: varchar("color", { length: 5 }).notNull(), // 'white' | 'black'

    // Accuracy metrics
    accuracyPercent: real("accuracy_percent"),
    blunders: smallint("blunders").notNull().default(0),
    mistakes: smallint("mistakes").notNull().default(0),
    inaccuracies: smallint("inaccuracies").notNull().default(0),
    brilliantMoves: smallint("brilliant_moves").notNull().default(0),
    goodMoves: smallint("good_moves").notNull().default(0),

    // Time management
    avgMoveTimeMs: integer("avg_move_time_ms"),
    longestMoveTimeMs: integer("longest_move_time_ms"),
    timeUsedPercent: real("time_used_percent"),

    // Material
    materialAdvantageAtEnd: smallint("material_advantage_at_end"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("player_game_stats_unique").on(t.gameId, t.userId),
    index("player_game_stats_user_id_idx").on(t.userId),
    index("player_game_stats_game_id_idx").on(t.gameId),
  ]
);

// ─────────────────────────────────────────────
// USER DAILY STATS
// ─────────────────────────────────────────────

export const userDailyStats = pgTable(
  "user_daily_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD

    gamesPlayed: smallint("games_played").notNull().default(0),
    gamesWon: smallint("games_won").notNull().default(0),
    gamesLost: smallint("games_lost").notNull().default(0),
    gamesDrawn: smallint("games_drawn").notNull().default(0),
    ratingChange: integer("rating_change").notNull().default(0),
    timePlayedMs: integer("time_played_ms").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("user_daily_stats_unique").on(t.userId, t.date),
    index("user_daily_stats_user_id_idx").on(t.userId),
    index("user_daily_stats_date_idx").on(t.date),
  ]
);

// ─────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  stats: one(userStats, {
    fields: [users.id],
    references: [userStats.userId],
  }),
  sessions: many(sessions),
  accounts: many(accounts),
  ratingHistory: many(ratingHistory),
  sentFriendRequests: many(friendships, { relationName: "requester" }),
  receivedFriendRequests: many(friendships, { relationName: "addressee" }),
  whiteGames: many(games, { relationName: "whitePlayer" }),
  blackGames: many(games, { relationName: "blackPlayer" }),
  achievements: many(userAchievements),
  playerGameStats: many(playerGameStats),
  dailyStats: many(userDailyStats),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const userStatsRelations = relations(userStats, ({ one }) => ({
  user: one(users, {
    fields: [userStats.userId],
    references: [users.id],
  }),
}));

export const ratingHistoryRelations = relations(ratingHistory, ({ one }) => ({
  user: one(users, {
    fields: [ratingHistory.userId],
    references: [users.id],
  }),
  game: one(games, {
    fields: [ratingHistory.gameId],
    references: [games.id],
  }),
}));

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  requester: one(users, {
    fields: [friendships.requesterId],
    references: [users.id],
    relationName: "requester",
  }),
  addressee: one(users, {
    fields: [friendships.addresseeId],
    references: [users.id],
    relationName: "addressee",
  }),
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
  whitePlayer: one(users, {
    fields: [games.whitePlayerId],
    references: [users.id],
    relationName: "whitePlayer",
  }),
  blackPlayer: one(users, {
    fields: [games.blackPlayerId],
    references: [users.id],
    relationName: "blackPlayer",
  }),
  moves: many(gameMoves),
  playerStats: many(playerGameStats),
  ratingHistory: many(ratingHistory),
  userAchievements: many(userAchievements),
}));

export const gameMovesRelations = relations(gameMoves, ({ one }) => ({
  game: one(games, {
    fields: [gameMoves.gameId],
    references: [games.id],
  }),
}));

export const achievementsRelations = relations(achievements, ({ many }) => ({
  userAchievements: many(userAchievements),
}));

export const userAchievementsRelations = relations(
  userAchievements,
  ({ one }) => ({
    user: one(users, {
      fields: [userAchievements.userId],
      references: [users.id],
    }),
    achievement: one(achievements, {
      fields: [userAchievements.achievementId],
      references: [achievements.id],
    }),
    game: one(games, {
      fields: [userAchievements.gameId],
      references: [games.id],
    }),
  })
);

export const playerGameStatsRelations = relations(
  playerGameStats,
  ({ one }) => ({
    game: one(games, {
      fields: [playerGameStats.gameId],
      references: [games.id],
    }),
    user: one(users, {
      fields: [playerGameStats.userId],
      references: [users.id],
    }),
  })
);

export const userDailyStatsRelations = relations(userDailyStats, ({ one }) => ({
  user: one(users, {
    fields: [userDailyStats.userId],
    references: [users.id],
  }),
}));

// ─────────────────────────────────────────────
// TYPE EXPORTS (Drizzle inferred types)
// ─────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type UserStats = typeof userStats.$inferSelect;
export type NewUserStats = typeof userStats.$inferInsert;
export type RatingHistory = typeof ratingHistory.$inferSelect;
export type NewRatingHistory = typeof ratingHistory.$inferInsert;
export type Friendship = typeof friendships.$inferSelect;
export type NewFriendship = typeof friendships.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type GameMove = typeof gameMoves.$inferSelect;
export type NewGameMove = typeof gameMoves.$inferInsert;
export type Achievement = typeof achievements.$inferSelect;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type PlayerGameStats = typeof playerGameStats.$inferSelect;
export type NewPlayerGameStats = typeof playerGameStats.$inferInsert;
export type UserDailyStats = typeof userDailyStats.$inferSelect;
export type NewUserDailyStats = typeof userDailyStats.$inferInsert;
