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

          // Build GameState for clients
          const whiteStats = await import("@/db").then(({ db }) =>
            import("@/db/schema").then(({ userStats }) =>
              import("drizzle-orm").then(({ eq }) =>
                db.query.userStats.findFirst({
                  where: eq(userStats.userId, game.whitePlayerId!),
                })
              )
            )
          );

          io.to(room).emit("game:started", {
            game: {
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
            },
          });

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
        const clockState = clockManager.getGameState(gameId);
        if (clockState) {
          clockManager.resumeClock(gameId);
          socket.to(room).emit("game:opponent_reconnected", {
            gameId,
            color: game.whitePlayerId === userId ? "white" : "black",
          });
        }
      }
    } catch (err) {
      console.error("[game:join]", err);
      socket.emit("error:generic", { code: "INTERNAL", message: "Failed to join game" });
    }
  });

  // ── game:move ────────────────────────────────────────────────────────
  socket.on("game:move", async ({ gameId, from, to, promotion }: { gameId: string; from: string; to: string; promotion?: string }) => {
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

      // Switch clock turn
      clockManager.switchTurn(gameId);
      const newClockState = clockManager.getGameState(gameId);

      const movePayload = {
        gameId,
        move: {
          san: result.san!,
          uci: result.uci!,
          fen: result.fen!,
          moveNumber: 0, // will be set by client
          color: (from === to ? "white" : "white") as any, // determined by game state
          timeSpentMs: undefined,
          clockRemainingMs: timeRemaining,
        },
        fen: result.fen!,
        pgn: result.pgn!,
        currentTurn: result.fen!.split(" ")[1] === "w" ? "white" : "black" as any,
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
      const updatedGame = await gameService.getGame(gameId);
      if (updatedGame?.isAiGame && updatedGame.status === "active") {
        setTimeout(() => makeAiMove(io, gameId, room), 500);
      }
    } catch (err) {
      console.error("[game:move]", err);
      socket.emit("error:generic", { code: "INTERNAL", message: "Move failed" });
    }
  });

  // ── game:resign ──────────────────────────────────────────────────────
  socket.on("game:resign", async ({ gameId }: { gameId: string }) => {
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
  socket.on("game:offer_draw", async ({ gameId }: { gameId: string }) => {
    try {
      const game = await gameService.getGame(gameId);
      if (!game || game.status !== "active") return;

      const userId = socket.data.userId;
      const color = game.whitePlayerId === userId ? "white" : "black";
      const room = SOCKET_ROOMS.game(gameId);

      // Notify opponent
      socket.to(room).emit("game:draw_offered", { gameId, byColor: color });
    } catch (err) {
      console.error("[game:offer_draw]", err);
    }
  });

  // ── game:accept_draw ─────────────────────────────────────────────────
  socket.on("game:accept_draw", async ({ gameId }: { gameId: string }) => {
    try {
      const room = SOCKET_ROOMS.game(gameId);
      const result = await gameService.acceptDraw(gameId);

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
  socket.on("game:chat_message", async ({ gameId, message }: { gameId: string; message: string }) => {
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

    clockManager.switchTurn(gameId);
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
      const newOnes = recent.filter(
        (ua) => ua.earnedAt > tenSecondsAgo && ua.gameId === gameId
      );

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
