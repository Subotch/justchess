/**
 * Socket.IO game event handlers
 */

import type { Socket } from "socket.io";
import { Chess } from "chess.js";
import type { AppServer } from "../index";
import type { SocketData } from "@/types/socket";
import { SOCKET_ROOMS } from "@/types/socket";
import { gameService } from "@/services/game.service";
import { clockManager } from "../clock-manager";
import type { PieceColor } from "@/types/game";
import { withRateLimit } from "../middleware/rate-limit.middleware";

type AppSocket = Socket<any, any, any, SocketData>;

export function registerGameHandlers(io: AppServer, socket: AppSocket): void {
  // ── game:join ────────────────────────────────────────────────────────
  socket.on("game:join", async ({ gameId }: { gameId: string }) => {
    try {
      const game = await gameService.getGame(gameId);
      if (!game) {
        socket.emit("error:generic", { code: "NOT_FOUND", message: "Game not found" });
        return;
      }

      const userId = socket.data.userId;
      const isParticipant =
        game.whitePlayerId === userId || game.blackPlayerId === userId;

      if (!isParticipant) {
        socket.emit("error:generic", { code: "FORBIDDEN", message: "Not a participant" });
        return;
      }

      const room = SOCKET_ROOMS.game(gameId);
      socket.join(room);
      socket.data.currentGameId = gameId;

      // If game is waiting and both players are now connected, start it
      if (game.status === "waiting") {
        const roomSockets = await io.in(room).fetchSockets();
        const participantSockets = roomSockets.filter((s) => {
          const sid = (s as any).data?.userId;
          return sid === game.whitePlayerId || sid === game.blackPlayerId;
        });

        if (participantSockets.length >= 2 || game.isAiGame) {
          const started = await gameService.startGame(gameId);

          // Start clock
          const timeMs = started.timeControlMinutes * 60 * 1000;
          const incrementMs = started.incrementSeconds * 1000;

          clockManager.startClock(
            gameId,
            game.whitePlayerId!,
            game.blackPlayerId,
            timeMs,
            timeMs,
            incrementMs,
            "white",
            // onTick — broadcast clock every second
            ({ whiteTimeMs, blackTimeMs, activeColor }) => {
              io.to(room).emit("game:clock_update", {
                gameId,
                whiteTimeRemainingMs: whiteTimeMs,
                blackTimeRemainingMs: blackTimeMs,
                activeColor,
              });
            },
            // onTimeout
            async () => {
              const clockState = clockManager.getGameState(gameId);
              if (!clockState) return;
              const timedOut =
                clockState.whiteTimeMs <= 0 ? "white" : "black";
              await gameService.handleTimeout(gameId, timedOut);
              const result = timedOut === "white" ? "black_wins" : "white_wins";
              io.to(room).emit("game:ended", {
                gameId,
                result,
                reason: "timeout",
                pgn: "",
              });
              io.to(SOCKET_ROOMS.spectator(gameId)).emit("game:ended", {
                gameId,
                result,
                reason: "timeout",
                pgn: "",
              });
            }
          );

          // Build initial GameState payload
          const initialGameState = {
            id: started.id,
            status: "active",
            gameType: started.gameType as any,
            timingCategory: started.timingCategory as any,
            timeControlMinutes: started.timeControlMinutes,
            incrementSeconds: started.incrementSeconds,
            white: {
              id: game.whitePlayerId!,
              username: (game as any).whitePlayer?.username ?? "Player",
              name: (game as any).whitePlayer?.name ?? "Player",
              image: (game as any).whitePlayer?.image ?? null,
              rating: started.whiteRatingBefore ?? 1200,
              color: "white",
              timeRemainingMs: timeMs,
              isConnected: true,
            },
            black: {
              id: game.blackPlayerId ?? "ai",
              username: game.isAiGame
                ? `AI Level ${game.aiDifficulty}`
                : (game as any).blackPlayer?.username ?? "Player",
              name: game.isAiGame
                ? `AI Level ${game.aiDifficulty}`
                : (game as any).blackPlayer?.name ?? "Player",
              image: null,
              rating: started.blackRatingBefore ?? 1200,
              color: "black",
              timeRemainingMs: timeMs,
              isConnected: true,
            },
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            pgn: "",
            moves: [],
            currentTurn: "white",
            moveCount: 0,
            result: "in_progress",
            isAiGame: started.isAiGame,
            aiDifficulty: started.aiDifficulty ?? undefined,
            aiColor: (started.aiColor as PieceColor) ?? "black",
            spectatorCount: 0,
            startedAt: started.startedAt?.toISOString(),
            createdAt: started.createdAt.toISOString(),
          };

          // Send game:started to each participant socket individually
          // so that a reconnecting player doesn't cause the opponent to reset
          // their client state upon a spurious duplicate game:started.
          for (const ps of participantSockets) {
            (ps as any).emit("game:started", { game: initialGameState });
          }
          // Also send to the socket that just joined (it may not be in
          // participantSockets yet if fetchSockets() was called before join)
          if (!participantSockets.some((ps) => (ps as any).data?.userId === userId)) {
            socket.emit("game:started", { game: initialGameState });
          }

          // If AI plays white, make the first move
          if (started.isAiGame && started.aiColor === "white") {
            setTimeout(() => makeAiMove(io, gameId, room), 500);
          }
        }
      }

      // Cancel any pending reconnect timeout
      clockManager.cancelReconnectTimeout(gameId, userId);

      // Notify room of reconnection if game was paused
      if (game.status === "active") {
        const activeClockState = clockManager.getGameState(gameId);
        if (activeClockState) {
          clockManager.resumeClock(gameId);
          socket.to(room).emit("game:opponent_reconnected", {
            gameId,
            color: game.whitePlayerId === userId ? "white" : "black",
          });
        }
        
        // Send game:started to newly connected player for active games
        // This ensures the client gets the full game state when joining mid-game
        const { getTimingCategory } = await import("@/types/game");
        const timingCategory = getTimingCategory(game.timeControlMinutes);
        
        // Get ratings for players
        const { db } = await import("@/db");
        const { userStats } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        
        let whiteRating = game.whiteRatingBefore ?? 1200;
        let blackRating = game.blackRatingBefore ?? 1200;
        
        if (game.whitePlayerId) {
          const ws = await db.query.userStats.findFirst({
            where: eq(userStats.userId, game.whitePlayerId),
          });
          if (ws) {
            switch (timingCategory) {
              case "bullet": whiteRating = ws.ratingBullet; break;
              case "blitz": whiteRating = ws.ratingBlitz; break;
              case "rapid": whiteRating = ws.ratingRapid; break;
              case "classical": whiteRating = ws.ratingClassical; break;
            }
          }
        }
        
        if (game.blackPlayerId) {
          const bs = await db.query.userStats.findFirst({
            where: eq(userStats.userId, game.blackPlayerId),
          });
          if (bs) {
            switch (timingCategory) {
              case "bullet": blackRating = bs.ratingBullet; break;
              case "blitz": blackRating = bs.ratingBlitz; break;
              case "rapid": blackRating = bs.ratingRapid; break;
              case "classical": blackRating = bs.ratingClassical; break;
            }
          }
        }
        
        // Get existing moves
        const existingMoves = await gameService.getGameMoves(gameId);
        
        // Build move list for client
        const moves = existingMoves.map((m, idx) => ({
          san: m.san,
          uci: m.uci,
          fen: m.fen,
          moveNumber: m.moveNumber,
          color: m.color as PieceColor,
          timeSpentMs: m.timeSpentMs,
        }));
        
// Determine current turn by replaying all moves
        let currentTurn: PieceColor = "white";
        if (existingMoves.length > 0) {
          const chess = new Chess();
          for (const move of existingMoves) {
            chess.move({
              from: move.uci.slice(0, 2),
              to: move.uci.slice(2, 4),
              promotion: move.uci[4] as "q" | "r" | "b" | "n" | undefined,
            });
          }
          currentTurn = chess.turn() === "w" ? "white" : "black";
        }
        
        // Get clock times
        const whiteTimeMs = activeClockState?.whiteTimeMs ?? (game.whiteTimeRemainingMs ?? game.timeControlMinutes * 60 * 1000);
        const blackTimeMs = activeClockState?.blackTimeMs ?? (game.blackTimeRemainingMs ?? game.timeControlMinutes * 60 * 1000);
        
        socket.emit("game:started", {
          game: {
            id: game.id,
            status: "active",
            gameType: game.gameType as any,
            timingCategory: game.timingCategory as any,
            timeControlMinutes: game.timeControlMinutes,
            incrementSeconds: game.incrementSeconds,
            white: {
              id: game.whitePlayerId!,
              username: (game as any).whitePlayer?.username ?? "Player",
              name: (game as any).whitePlayer?.name ?? "Player",
              image: (game as any).whitePlayer?.image ?? null,
              rating: whiteRating,
              color: "white",
              timeRemainingMs: whiteTimeMs,
              isConnected: true,
            },
            black: {
              id: game.blackPlayerId ?? "ai",
              username: game.isAiGame
                ? `AI Level ${game.aiDifficulty}`
                : (game as any).blackPlayer?.username ?? "Player",
              name: game.isAiGame
                ? `AI Level ${game.aiDifficulty}`
                : (game as any).blackPlayer?.name ?? "Player",
              image: null,
              rating: blackRating,
              color: "black",
              timeRemainingMs: blackTimeMs,
              isConnected: true,
            },
            fen: existingMoves.length > 0 ? existingMoves[existingMoves.length - 1].fen : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            pgn: game.pgn ?? "",
            moves,
            currentTurn,
            moveCount: existingMoves.length,
            result: game.result ?? "in_progress",
            isAiGame: game.isAiGame,
            aiDifficulty: game.aiDifficulty ?? undefined,
            aiColor: (game.aiColor as PieceColor) ?? "black",
            spectatorCount: 0,
            startedAt: game.startedAt?.toISOString(),
            createdAt: game.createdAt.toISOString(),
          },
        });
      }
    } catch (err) {
      console.error("[game:join]", err);
      socket.emit("error:generic", { code: "INTERNAL", message: "Failed to join game" });
    }
  });

  // ── game:move ────────────────────────────────────────────────────────
  // Wrap handler with rate limiter: max 3 moves per second to prevent DoS
  withRateLimit(socket, "game:move", async ({ gameId, from, to, promotion }: { gameId: string; from: string; to: string; promotion?: string }) => {
    try {
      const userId = socket.data.userId;
      const room = SOCKET_ROOMS.game(gameId);

      // Get current clock times
      const clockState = clockManager.getGameState(gameId);
      const timeRemaining = clockState
        ? clockState.activeColor === "white"
          ? clockState.whiteTimeMs
          : clockState.blackTimeMs
        : undefined;

      const result = await gameService.makeMove({
        gameId,
        userId,
        from,
        to,
        promotion: promotion as any,
        clockRemainingMs: timeRemaining,
      });

      if (!result.success) {
        socket.emit("error:invalid_move", {
          gameId,
          reason: result.error ?? "Illegal move",
        });
        return;
      }

      // Switch clock turn with race condition guard.
      // switchTurn is serialized via per-game async queue inside ClockManager,
      // so the check-and-mutate is atomic. appliedIncrement tells us whether
      // the increment was actually applied (false ⇒ stale call, ignore).
      const switchResult = await clockManager.switchTurn(gameId, clockState?.activeColor);
      if (!switchResult.appliedIncrement) {
        console.warn(
          `[game:move] Turn switch for game ${gameId} did not apply increment: ${switchResult.reason ?? "unknown"}`
        );
        // No retry needed — if color mismatched, another move already processed.
      }
      const newClockState = clockManager.getGameState(gameId);

      // Determine the color of the player who just moved (opposite of whose turn it is now)
      const nextTurnColor: PieceColor = result.fen!.split(" ")[1] === "w" ? "white" : "black";
      const movedColor: PieceColor = nextTurnColor === "white" ? "black" : "white";

      const movePayload = {
        gameId,
        move: {
          san: result.san!,
          uci: result.uci!,
          fen: result.fen!,
          moveNumber: result.moveNumber!,
          color: movedColor,
          timeSpentMs: undefined,
          clockRemainingMs: timeRemaining,
        },
        fen: result.fen!,
        pgn: result.pgn!,
        currentTurn: nextTurnColor,
        whiteTimeRemainingMs: newClockState?.whiteTimeMs ?? 0,
        blackTimeRemainingMs: newClockState?.blackTimeMs ?? 0,
      };

      // Broadcast to game room and spectators
      io.to(room).emit("game:move_made", movePayload);
      io.to(SOCKET_ROOMS.spectator(gameId)).emit("game:move_made", movePayload);

      // If game ended
      if (result.gameEnded && result.result) {
        clockManager.stopClock(gameId);

        const endPayload = {
          gameId,
          result: result.result,
          reason: result.resultReason!,
          pgn: result.pgn!,
          whiteRatingChange: result.whiteRatingChange,
          blackRatingChange: result.blackRatingChange,
        };

        io.to(room).emit("game:ended", endPayload);
        io.to(SOCKET_ROOMS.spectator(gameId)).emit("game:ended", endPayload);

        // Send achievement notifications
        await notifyAchievements(io, gameId);
        return;
      }

      // Trigger AI move after a short delay to allow state to settle
      // Only trigger if it's AI's turn (not the human player's turn)
      const updatedGame = await gameService.getGame(gameId);
      if (updatedGame?.isAiGame && updatedGame.status === "active") {
        const aiColor = (updatedGame.aiColor as PieceColor) ?? "black";
        // Only call AI if the next turn is the AI's color
        if (nextTurnColor === aiColor) {
          setTimeout(() => makeAiMove(io, gameId, room), 500);
        }
      }
    } catch (err) {
      console.error("[game:move]", err);
      socket.emit("error:generic", { code: "INTERNAL", message: "Move failed" });
    }
  });

  // ── game:resign ──────────────────────────────────────────────────────
  // Wrap handler with rate limiter: max 1 resign per 3 seconds
  withRateLimit(socket, "game:resign", async ({ gameId }: { gameId: string }) => {
    try {
      const userId = socket.data.userId;
      const room = SOCKET_ROOMS.game(gameId);

      const result = await gameService.resign(gameId, userId);
      if (!result.success) {
        socket.emit("error:generic", { code: "BAD_REQUEST", message: result.error ?? "Cannot resign" });
        return;
      }

      clockManager.stopClock(gameId);

      const endPayload = {
        gameId,
        result: result.result!,
        reason: result.resultReason!,
        pgn: result.pgn ?? "",
        whiteRatingChange: result.whiteRatingChange,
        blackRatingChange: result.blackRatingChange,
      };

      io.to(room).emit("game:ended", endPayload);
      io.to(SOCKET_ROOMS.spectator(gameId)).emit("game:ended", endPayload);

      await notifyAchievements(io, gameId);
    } catch (err) {
      console.error("[game:resign]", err);
      socket.emit("error:generic", { code: "INTERNAL", message: "Resign failed" });
    }
  });

  // ── game:offer_draw ──────────────────────────────────────────────────
  // Wrap handler with rate limiter: max 2 offers per 5 seconds
  withRateLimit(socket, "game:offer_draw", async ({ gameId }: { gameId: string }) => {
    try {
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit("error:generic", { code: "UNAUTHORIZED", message: "Not authenticated" });
        return;
      }

      const result = await gameService.offerDraw(gameId, userId);
      if (!result.success) {
        socket.emit("error:generic", { code: "BAD_REQUEST", message: result.error ?? "Cannot offer draw" });
        return;
      }

      const room = SOCKET_ROOMS.game(gameId);
      // Notify opponent
      socket.to(room).emit("game:draw_offered", { gameId, byColor: result.color });
    } catch (err) {
      console.error("[game:offer_draw]", err);
    }
  });

  // ── game:accept_draw ─────────────────────────────────────────────────
  socket.on("game:accept_draw", async ({ gameId }: { gameId: string }) => {
    try {
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit("error:generic", { code: "UNAUTHORIZED", message: "Not authenticated" });
        return;
      }

      const room = SOCKET_ROOMS.game(gameId);
      const result = await gameService.acceptDraw(gameId, userId);

      if (!result.success) {
        socket.emit("error:generic", { code: "BAD_REQUEST", message: result.error ?? "Cannot accept draw" });
        return;
      }

      clockManager.stopClock(gameId);

      const endPayload = {
        gameId,
        result: "draw" as const,
        reason: "agreement" as const,
        pgn: result.pgn ?? "",
        whiteRatingChange: result.whiteRatingChange,
        blackRatingChange: result.blackRatingChange,
      };

      io.to(room).emit("game:ended", endPayload);
      io.to(SOCKET_ROOMS.spectator(gameId)).emit("game:ended", endPayload);
    } catch (err) {
      console.error("[game:accept_draw]", err);
    }
  });

  // ── game:decline_draw ────────────────────────────────────────────────
  socket.on("game:decline_draw", async ({ gameId }: { gameId: string }) => {
    try {
      const game = await gameService.getGame(gameId);
      if (!game) return;

      const userId = socket.data.userId;
      const color = game.whitePlayerId === userId ? "white" : "black";
      const room = SOCKET_ROOMS.game(gameId);

      socket.to(room).emit("game:draw_declined", { gameId, byColor: color });
    } catch (err) {
      console.error("[game:decline_draw]", err);
    }
  });

// ── game:chat_message ────────────────────────────────────────────────
  // Wrap handler with rate limiter: max 2 messages per 2 seconds
  withRateLimit(socket, "game:chat_message", async ({ gameId, message }: { gameId: string; message: string }) => {
    try {
      // Sanitize message
      const sanitized = message.trim().slice(0, 200);
      if (!sanitized) return;

      const room = SOCKET_ROOMS.game(gameId);
      io.to(room).emit("game:chat_message", {
        gameId,
        userId: socket.data.userId,
        username: socket.data.username,
        message: sanitized,
        sentAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[game:chat_message]", err);
    }
  });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function makeAiMove(io: AppServer, gameId: string, room: string): Promise<void> {
  try {
    const game = await gameService.getGame(gameId);
    if (!game || !game.isAiGame || game.status !== "active") {
      console.log("[AI] Skipping - game not valid or not active");
      return;
    }

    const existingMoves = await gameService.getGameMoves(gameId);
    const chess = new Chess();

    for (const move of existingMoves) {
      chess.move({
        from: move.uci.slice(0, 2),
        to: move.uci.slice(2, 4),
        promotion: move.uci[4] as "q" | "r" | "b" | "n" | undefined,
      });
    }

    const aiColor: PieceColor = (game.aiColor as PieceColor) ?? "black";
    const currentTurn: PieceColor = chess.turn() === "w" ? "white" : "black";
    
    console.log(`[AI] Game ${gameId} - AI color: ${aiColor}, Current turn: ${currentTurn}, Moves: ${existingMoves.length}`);
    
    if (currentTurn !== aiColor) {
      console.log("[AI] Not AI's turn");
      return;
    }

    const possibleMoves = chess.moves({ verbose: true });
    if (!possibleMoves.length) {
      console.log("[AI] No moves available");
      return;
    }

    const moveIndex = pickAiMoveIndex(possibleMoves.length, game.aiDifficulty ?? 5);
    const selectedMove = possibleMoves[moveIndex];

    console.log(`[AI] Making move: ${selectedMove.san}`);

    // For AI games: if AI is white, use whitePlayerId; if AI is black, use blackPlayerId
    const aiUserId = aiColor === "white" ? game.whitePlayerId : game.blackPlayerId;
    if (!aiUserId) {
      console.error("[AI] No user ID for AI - whitePlayerId:", game.whitePlayerId, "blackPlayerId:", game.blackPlayerId);
      return;
    }

    const result = await gameService.makeMove({
      gameId,
      userId: aiUserId,
      from: selectedMove.from,
      to: selectedMove.to,
      promotion: (selectedMove.promotion as "q" | "r" | "b" | "n" | undefined) ?? undefined,
    });

if (!result.success) {
      console.error("[AI] Move failed", result.error);
      return;
    }

    // Get clock state before switchTurn and use as race condition guard.
    // switchTurn is async and atomic via per-game queue.
    const aiClockState = clockManager.getGameState(gameId);
    const switchResult = await clockManager.switchTurn(gameId, aiClockState?.activeColor);
    if (!switchResult.appliedIncrement) {
      console.warn(
        `[AI] Turn switch for game ${gameId} did not apply increment: ${switchResult.reason ?? "unknown"}`
      );
    }
    const newClockState = clockManager.getGameState(gameId);

    const movePayload = {
      gameId,
      move: {
        san: result.san!,
        uci: result.uci!,
        fen: result.fen!,
        moveNumber: Math.ceil((existingMoves.length + 1) / 2),
        color: aiColor as PieceColor,
        clockRemainingMs:
          aiColor === "white"
            ? newClockState?.whiteTimeMs
            : newClockState?.blackTimeMs,
      },
      fen: result.fen!,
      pgn: result.pgn!,
      currentTurn: (result.fen!.split(" ")[1] === "w" ? "white" : "black") as PieceColor,
      whiteTimeRemainingMs: newClockState?.whiteTimeMs ?? 0,
      blackTimeRemainingMs: newClockState?.blackTimeMs ?? 0,
    };

    io.to(room).emit("game:move_made", movePayload);
    io.to(SOCKET_ROOMS.spectator(gameId)).emit("game:move_made", movePayload);

    if (result.gameEnded && result.result) {
      clockManager.stopClock(gameId);

      const endPayload = {
        gameId,
        result: result.result,
        reason: result.resultReason!,
        pgn: result.pgn!,
        whiteRatingChange: result.whiteRatingChange,
        blackRatingChange: result.blackRatingChange,
      };

      io.to(room).emit("game:ended", endPayload);
      io.to(SOCKET_ROOMS.spectator(gameId)).emit("game:ended", endPayload);
      await notifyAchievements(io, gameId);
    }
  } catch (error) {
    console.error("[AI] makeAiMove failed", error);
  }
}

function pickAiMoveIndex(moveCount: number, difficulty: number): number {
  if (moveCount <= 1) return 0;

  const strength = Math.min(Math.max(difficulty, 1), 20);
  const spread = Math.max(1, Math.ceil(moveCount * ((21 - strength) / 20)));
  return Math.floor(Math.random() * spread);
}

async function notifyAchievements(io: AppServer, gameId: string): Promise<void> {
  try {
    const { db } = await import("@/db");
    const { games, achievements, userAchievements } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const game = await db.query.games.findFirst({ where: eq(games.id, gameId) });
    if (!game) return;

    const playerIds = [game.whitePlayerId, game.blackPlayerId].filter(Boolean) as string[];

    for (const userId of playerIds) {
      // Find newly earned achievements (earned in last 10 seconds)
      const recent = await db.query.userAchievements.findMany({
        where: eq(userAchievements.userId, userId),
        with: { achievement: true },
      });

      const tenSecondsAgo = new Date(Date.now() - 10_000);
      const newOnes = recent.filter((ua) => ua.earnedAt > tenSecondsAgo);

      for (const ua of newOnes) {
        const ach = (ua as any).achievement;
        if (ach) {
          io.to(`user:${userId}`).emit("achievement:unlocked", {
            achievementId: ach.id,
            name: ach.name,
            description: ach.description,
            iconUrl: ach.iconUrl ?? undefined,
            points: ach.points,
          });
        }
      }
    }
  } catch (err) {
    console.error("[notifyAchievements]", err);
  }
}
