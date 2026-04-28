/**
 * Game Service — core business logic for chess games
 * All move validation happens server-side here.
 */

import { Chess } from "chess.js";
import { eq, and, or, desc, sql, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  games,
  gameMoves,
  userStats,
  ratingHistory,
  playerGameStats,
  userDailyStats,
  users,
} from "@/db/schema";
import { calculateNewRatings } from "@/lib/elo";
import { achievementService } from "./achievement.service";
import type {
  GameResult,
  GameResultReason,
  GameType,
  PieceColor,
  TimingCategory,
} from "@/types/game";
import { getTimingCategory } from "@/types/game";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface CreateGameOptions {
  whitePlayerId: string;
  blackPlayerId: string | null; // null for AI
  gameType: GameType;
  timeControlMinutes: number;
  incrementSeconds: number;
  isAiGame?: boolean;
  aiDifficulty?: number;
  aiColor?: PieceColor;
}

export interface MakeMoveOptions {
  gameId: string;
  userId: string;
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
  timeSpentMs?: number;
  clockRemainingMs?: number;
}

export interface MakeMoveResult {
  success: boolean;
  error?: string;
  san?: string;
  uci?: string;
  fen?: string;
  pgn?: string;
  moveNumber?: number;
  isCheck?: boolean;
  isCheckmate?: boolean;
  isStalemate?: boolean;
  isDraw?: boolean;
  gameEnded?: boolean;
  result?: GameResult;
  resultReason?: GameResultReason;
  whiteRatingChange?: number;
  blackRatingChange?: number;
}

// ─────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────

export const gameService = {
  /**
   * Create a new game record in the database.
   */
  async createGame(options: CreateGameOptions) {
    const {
      whitePlayerId,
      blackPlayerId,
      gameType,
      timeControlMinutes,
      incrementSeconds,
      isAiGame = false,
      aiDifficulty,
      aiColor,
    } = options;

    const timingCategory = getTimingCategory(timeControlMinutes);
    const timeMs = timeControlMinutes * 60 * 1000;

    // Fetch ratings for snapshot
    let whiteRating = 1200;
    let blackRating = 1200;

    if (whitePlayerId) {
      const ws = await db.query.userStats.findFirst({
        where: eq(userStats.userId, whitePlayerId),
      });
      if (ws) {
        whiteRating = getRatingForCategory(ws, timingCategory);
      }
    }

    if (blackPlayerId) {
      const bs = await db.query.userStats.findFirst({
        where: eq(userStats.userId, blackPlayerId),
      });
      if (bs) {
        blackRating = getRatingForCategory(bs, timingCategory);
      }
    }

    const [game] = await db
      .insert(games)
      .values({
        whitePlayerId,
        blackPlayerId,
        gameType,
        timingCategory,
        timeControlMinutes,
        incrementSeconds,
        isAiGame,
        aiDifficulty,
        aiColor,
        status: "waiting",
        result: "in_progress",
        whiteTimeRemainingMs: timeMs,
        blackTimeRemainingMs: timeMs,
        whiteRatingBefore: whiteRating,
        blackRatingBefore: blackRating,
      })
      .returning();

    return game;
  },

  /**
   * Start a game (transition from waiting → active).
   */
  async startGame(gameId: string) {
    const [game] = await db
      .update(games)
      .set({ status: "active", startedAt: new Date() })
      .where(eq(games.id, gameId))
      .returning();
    return game;
  },

  /**
   * Validate and apply a move. This is the critical anti-cheat path.
   * All moves MUST go through this function.
   */
  async makeMove(options: MakeMoveOptions): Promise<MakeMoveResult> {
    const { gameId, userId, from, to, promotion, timeSpentMs, clockRemainingMs } = options;

    // 1. Load game from DB
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });

    if (!game) return { success: false, error: "Game not found" };
    if (game.status !== "active") return { success: false, error: "Game is not active" };

    // 2. Determine player color
    const isWhite = game.whitePlayerId === userId;
    const isBlack = game.blackPlayerId === userId;
    if (!isWhite && !isBlack) return { success: false, error: "Not a participant" };

    const playerColor: PieceColor = isWhite ? "white" : "black";

    // 3. Reconstruct board from existing moves
    const chess = new Chess();
    const existingMoves = await db.query.gameMoves.findMany({
      where: eq(gameMoves.gameId, gameId),
      orderBy: [asc(gameMoves.createdAt)],
    });

    // Replay all moves to get current position
    for (const m of existingMoves) {
      chess.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        promotion: m.uci.length >= 5 ? (m.uci[4] as "q" | "r" | "b" | "n") : undefined,
      });
    }

    // 4. Verify it's this player's turn
    const currentTurn = chess.turn() === "w" ? "white" : "black";
    if (currentTurn !== playerColor) {
      return { success: false, error: "Not your turn" };
    }

    // 5. Validate the move by checking available moves
    const availableMoves = chess.moves({ verbose: true });
    const isLegal = availableMoves.some(
      (m) => m.from === from && m.to === to && (promotion ? m.promotion === promotion : true)
    );
    if (!isLegal) {
      return { success: false, error: "Illegal move" };
    }

    // Apply the move only after validation
    const moveResult = chess.move({ from, to, promotion });

    const san = moveResult.san;
    const uci = `${from}${to}${promotion || ""}`;
    const fen = chess.fen();
    const pgn = chess.pgn();
    const moveNumber = Math.ceil(existingMoves.length / 2) + 1;

    // 6. Persist the move
    await db.insert(gameMoves).values({
      gameId,
      moveNumber,
      color: playerColor,
      san,
      uci,
      fen,
      timeSpentMs,
      clockRemainingMs,
    });

    // 7. Check for game-ending conditions
    const isCheckmate = chess.isCheckmate();
    const isStalemate = chess.isStalemate();
    const isDraw =
      chess.isDraw() ||
      chess.isInsufficientMaterial() ||
      chess.isThreefoldRepetition();
    const isCheck = chess.inCheck();

    let gameEnded = false;
    let result: GameResult | undefined;
    let resultReason: GameResultReason | undefined;

    if (isCheckmate) {
      gameEnded = true;
      result = playerColor === "white" ? "white_wins" : "black_wins";
      resultReason = "checkmate";
    } else if (isStalemate) {
      gameEnded = true;
      result = "draw";
      resultReason = "stalemate";
    } else if (chess.isInsufficientMaterial()) {
      gameEnded = true;
      result = "draw";
      resultReason = "insufficient_material";
    } else if (chess.isThreefoldRepetition()) {
      gameEnded = true;
      result = "draw";
      resultReason = "threefold_repetition";
    } else if (chess.isDraw()) {
      gameEnded = true;
      result = "draw";
      resultReason = "fifty_move_rule";
    }

    // 8. If game ended, finalize
    let whiteRatingChange: number | undefined;
    let blackRatingChange: number | undefined;

    if (gameEnded && result) {
      const finalResult = await this.finalizeGame(gameId, result, resultReason!, pgn, fen);
      whiteRatingChange = finalResult.whiteRatingChange;
      blackRatingChange = finalResult.blackRatingChange;
    } else {
      // Update move count
      await db
        .update(games)
        .set({ totalMoves: existingMoves.length + 1 })
        .where(eq(games.id, gameId));
    }

    return {
      success: true,
      san,
      uci,
      fen,
      pgn,
      moveNumber,
      isCheck,
      isCheckmate,
      isStalemate,
      isDraw,
      gameEnded,
      result,
      resultReason,
      whiteRatingChange,
      blackRatingChange,
    };
  },

  /**
   * Resign from a game.
   */
  async resign(gameId: string, userId: string): Promise<MakeMoveResult> {
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });

    if (!game) return { success: false, error: "Game not found" };
    if (game.status !== "active") return { success: false, error: "Game is not active" };

    const isWhite = game.whitePlayerId === userId;
    const isBlack = game.blackPlayerId === userId;
    if (!isWhite && !isBlack) return { success: false, error: "Not a participant" };

    const result: GameResult = isWhite ? "black_wins" : "white_wins";

    // Reconstruct PGN
    const chess = new Chess();
    const existingMoves = await db.query.gameMoves.findMany({
      where: eq(gameMoves.gameId, gameId),
      orderBy: [asc(gameMoves.createdAt)],
    });
    for (const m of existingMoves) {
      chess.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        promotion: m.uci.length >= 5 ? (m.uci[4] as "q" | "r" | "b" | "n") : undefined,
      });
    }

    const finalResult = await this.finalizeGame(
      gameId,
      result,
      "resignation",
      chess.pgn(),
      chess.fen()
    );

    return {
      success: true,
      gameEnded: true,
      result,
      resultReason: "resignation",
      whiteRatingChange: finalResult.whiteRatingChange,
      blackRatingChange: finalResult.blackRatingChange,
    };
  },

  /**
   * Accept a draw offer — finalize as draw by agreement.
   */
  async acceptDraw(gameId: string, userId: string): Promise<MakeMoveResult> {
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });
    if (!game) return { success: false, error: "Game not found" };
    if (game.status !== "active") return { success: false, error: "Game is not active" };

    // Check if user is a participant
    const isWhite = game.whitePlayerId === userId;
    const isBlack = game.blackPlayerId === userId;
    if (!isWhite && !isBlack) return { success: false, error: "Not a participant" };

    // Check if there's an active draw offer (from the opponent)
    const myColor: PieceColor = isWhite ? "white" : "black";
    const opponentColor: PieceColor = isWhite ? "black" : "white";
    if (game.drawOfferedBy !== opponentColor) {
      return { success: false, error: "No draw offer from opponent" };
    }

    const chess = new Chess();
    const existingMoves = await db.query.gameMoves.findMany({
      where: eq(gameMoves.gameId, gameId),
      orderBy: [asc(gameMoves.createdAt)],
    });
    for (const m of existingMoves) {
      chess.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        promotion: m.uci.length >= 5 ? (m.uci[4] as "q" | "r" | "b" | "n") : undefined,
      });
    }

    // Clear draw offer before finalizing
    await db.update(games).set({ drawOfferedBy: null }).where(eq(games.id, gameId));

    const finalResult = await this.finalizeGame(
      gameId,
      "draw",
      "agreement",
      chess.pgn(),
      chess.fen()
    );

    return {
      success: true,
      gameEnded: true,
      result: "draw",
      resultReason: "agreement",
      whiteRatingChange: finalResult.whiteRatingChange,
      blackRatingChange: finalResult.blackRatingChange,
};
  },

  /**
   * Offer a draw to the opponent.
   */
  async offerDraw(gameId: string, userId: string): Promise<{ success: boolean; error?: string; color?: PieceColor }> {
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });
    if (!game) return { success: false, error: "Game not found" };
    if (game.status !== "active") return { success: false, error: "Game is not active" };

    // Check if user is a participant
    const isWhite = game.whitePlayerId === userId;
    const isBlack = game.blackPlayerId === userId;
    if (!isWhite && !isBlack) return { success: false, error: "Not a participant" };

    const color: PieceColor = isWhite ? "white" : "black";

    // Check if there's already a draw offer from either side
    if (game.drawOfferedBy) {
      return { success: false, error: "Draw offer already active" };
    }

    // Set draw offer in DB
    await db.update(games).set({ drawOfferedBy: color }).where(eq(games.id, gameId));

    return { success: true, color };
  },

  /**
   * Handle timeout — the player whose clock ran out loses.
   */
  async handleTimeout(gameId: string, timedOutColor: PieceColor): Promise<void> {
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });
    if (!game || game.status !== "active") return;

    const result: GameResult =
      timedOutColor === "white" ? "black_wins" : "white_wins";

    const chess = new Chess();
    const existingMoves = await db.query.gameMoves.findMany({
      where: eq(gameMoves.gameId, gameId),
      orderBy: [asc(gameMoves.createdAt)],
    });
    for (const m of existingMoves) {
      chess.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        promotion: m.uci.length >= 5 ? (m.uci[4] as "q" | "r" | "b" | "n") : undefined,
      });
    }

    await this.finalizeGame(gameId, result, "timeout", chess.pgn(), chess.fen());
  },

  /**
   * Finalize a game: update DB, calculate ratings, trigger achievements.
   */
  async finalizeGame(
    gameId: string,
    result: GameResult,
    resultReason: GameResultReason,
    pgn: string,
    finalFen: string
  ) {
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });
    if (!game) throw new Error("Game not found");

    let whiteRatingChange = 0;
    let blackRatingChange = 0;
    let whiteRatingAfter = game.whiteRatingBefore ?? 1200;
    let blackRatingAfter = game.blackRatingBefore ?? 1200;

    // Calculate ELO changes for rated games
    if (game.gameType === "rated" && !game.isAiGame && game.whitePlayerId && game.blackPlayerId) {
      const eloResult =
        result === "white_wins" ? 1 : result === "black_wins" ? 0 : 0.5;

      const whiteStats = await db.query.userStats.findFirst({
        where: eq(userStats.userId, game.whitePlayerId),
      });
      const blackStats = await db.query.userStats.findFirst({
        where: eq(userStats.userId, game.blackPlayerId),
      });

      const ratings = calculateNewRatings(
        game.whiteRatingBefore ?? 1200,
        game.blackRatingBefore ?? 1200,
        eloResult as 1 | 0 | 0.5,
        whiteStats?.gamesPlayed ?? 0,
        blackStats?.gamesPlayed ?? 0
      );

      whiteRatingChange = ratings.whiteChange;
      blackRatingChange = ratings.blackChange;
      whiteRatingAfter = ratings.whiteNew;
      blackRatingAfter = ratings.blackNew;

      // Update ratings in user_stats
      const timingCategory = game.timingCategory as TimingCategory;
      const ratingField = getRatingFieldForCategory(timingCategory);

      await db
        .update(userStats)
        .set({ [ratingField]: whiteRatingAfter, updatedAt: new Date() })
        .where(eq(userStats.userId, game.whitePlayerId));

      await db
        .update(userStats)
        .set({ [ratingField]: blackRatingAfter, updatedAt: new Date() })
        .where(eq(userStats.userId, game.blackPlayerId));

      // Insert rating history
      await db.insert(ratingHistory).values([
        {
          userId: game.whitePlayerId,
          gameId,
          timingCategory,
          ratingBefore: game.whiteRatingBefore ?? 1200,
          ratingAfter: whiteRatingAfter,
          ratingChange: whiteRatingChange,
        },
        {
          userId: game.blackPlayerId,
          gameId,
          timingCategory,
          ratingBefore: game.blackRatingBefore ?? 1200,
          ratingAfter: blackRatingAfter,
          ratingChange: blackRatingChange,
        },
      ]);
    }

    // Update game record
    const existingMoves = await db.query.gameMoves.findMany({
      where: eq(gameMoves.gameId, gameId),
    });

    await db
      .update(games)
      .set({
        status: "completed",
        result,
        resultReason,
        pgn,
        finalFen,
        totalMoves: existingMoves.length,
        whiteRatingAfter,
        blackRatingAfter,
        endedAt: new Date(),
      })
      .where(eq(games.id, gameId));

    // Update user stats (wins/losses/draws)
    if (game.whitePlayerId) {
      await updateUserGameStats(game.whitePlayerId, result, "white", game.isAiGame);
    }
    if (game.blackPlayerId) {
      await updateUserGameStats(game.blackPlayerId, result, "black", game.isAiGame);
    }

    // Check achievements
    if (game.whitePlayerId) {
      await achievementService.checkAndAward(game.whitePlayerId, gameId);
    }
    if (game.blackPlayerId) {
      await achievementService.checkAndAward(game.blackPlayerId, gameId);
    }

    return { whiteRatingChange, blackRatingChange, whiteRatingAfter, blackRatingAfter };
  },

  /**
   * Get game by ID with player info.
   */
  async getGame(gameId: string) {
    return db.query.games.findFirst({
      where: eq(games.id, gameId),
      with: {
        whitePlayer: {
          columns: { id: true, username: true, name: true, image: true },
        },
        blackPlayer: {
          columns: { id: true, username: true, name: true, image: true },
        },
      },
    });
  },

  /**
   * Get game moves in order.
   */
  async getGameMoves(gameId: string) {
    return db.query.gameMoves.findMany({
      where: eq(gameMoves.gameId, gameId),
      orderBy: [asc(gameMoves.createdAt)],
    });
  },

  /**
   * Get user's game history with pagination.
   */
  async getGameHistory(
    userId: string,
    page = 1,
    pageSize = 20,
    filters: { gameType?: string; timingCategory?: string } = {}
  ) {
    const offset = (page - 1) * pageSize;

    const conditions = [
      or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)),
      eq(games.status, "completed"),
    ];

    if (filters.gameType) {
      conditions.push(eq(games.gameType, filters.gameType as any));
    }
    if (filters.timingCategory) {
      conditions.push(eq(games.timingCategory, filters.timingCategory as any));
    }

    const [items, countResult] = await Promise.all([
      db.query.games.findMany({
        where: and(...conditions),
        orderBy: [desc(games.endedAt)],
        limit: pageSize,
        offset,
        with: {
          whitePlayer: {
            columns: { id: true, username: true, name: true, image: true },
          },
          blackPlayer: {
            columns: { id: true, username: true, name: true, image: true },
          },
        },
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(games)
        .where(and(...conditions)),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: offset + items.length < total,
    };
  },

  /**
   * Get currently live games for spectator lobby.
   */
  async getLiveGames(limit = 20) {
    return db.query.games.findMany({
      where: eq(games.status, "active"),
      orderBy: [desc(games.startedAt)],
      limit,
      with: {
        whitePlayer: {
          columns: { id: true, username: true },
        },
        blackPlayer: {
          columns: { id: true, username: true },
        },
      },
    });
  },
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function getRatingForCategory(stats: any, category: TimingCategory): number {
  switch (category) {
    case "bullet": return stats.ratingBullet;
    case "blitz": return stats.ratingBlitz;
    case "rapid": return stats.ratingRapid;
    case "classical": return stats.ratingClassical;
    default: return stats.ratingRapid;
  }
}

function getRatingFieldForCategory(category: TimingCategory): string {
  switch (category) {
    case "bullet": return "ratingBullet";
    case "blitz": return "ratingBlitz";
    case "rapid": return "ratingRapid";
    case "classical": return "ratingClassical";
    default: return "ratingRapid";
  }
}

async function updateUserGameStats(
  userId: string,
  result: GameResult,
  color: PieceColor,
  isAiGame: boolean
) {
  const won =
    (color === "white" && result === "white_wins") ||
    (color === "black" && result === "black_wins");
  const lost =
    (color === "white" && result === "black_wins") ||
    (color === "black" && result === "white_wins");
  const drawn = result === "draw";

  const stats = await db.query.userStats.findFirst({
    where: eq(userStats.userId, userId),
  });

  if (!stats) return;

  const newWinStreak = won ? stats.currentWinStreak + 1 : 0;
  const newBestStreak = Math.max(stats.bestWinStreak, newWinStreak);

  await db
    .update(userStats)
    .set({
      gamesPlayed: stats.gamesPlayed + 1,
      gamesWon: won ? stats.gamesWon + 1 : stats.gamesWon,
      gamesLost: lost ? stats.gamesLost + 1 : stats.gamesLost,
      gamesDrawn: drawn ? stats.gamesDrawn + 1 : stats.gamesDrawn,
      currentWinStreak: newWinStreak,
      bestWinStreak: newBestStreak,
      aiGamesPlayed: isAiGame ? stats.aiGamesPlayed + 1 : stats.aiGamesPlayed,
      aiGamesWon: isAiGame && won ? stats.aiGamesWon + 1 : stats.aiGamesWon,
      lastGameAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(userStats.userId, userId));

  // Update daily stats
  const today = new Date().toISOString().slice(0, 10);
  await db
    .insert(userDailyStats)
    .values({
      userId,
      date: today,
      gamesPlayed: 1,
      gamesWon: won ? 1 : 0,
      gamesLost: lost ? 1 : 0,
      gamesDrawn: drawn ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [userDailyStats.userId, userDailyStats.date],
      set: {
        gamesPlayed: sql`${userDailyStats.gamesPlayed} + 1`,
        gamesWon: sql`${userDailyStats.gamesWon} + ${won ? 1 : 0}`,
        gamesLost: sql`${userDailyStats.gamesLost} + ${lost ? 1 : 0}`,
        gamesDrawn: sql`${userDailyStats.gamesDrawn} + ${drawn ? 1 : 0}`,
        updatedAt: new Date(),
      },
    });
}
