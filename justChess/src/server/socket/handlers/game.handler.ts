/**
 * Socket.IO game event handlers
 */

import type { Socket } from "socket.io";
import type { AppServer } from "../index";
import type { SocketData } from "@/types/socket";
import { gameService } from "@/services/game.service";
import { clockManager } from "../clock-manager";
import { SOCKET_ROOMS } from "@/types/socket";

type AppSocket = Socket<any, any, any, SocketData>;

export function registerGameHandlers(io: AppServer, socket: AppSocket): void {
  const { userId, username } = socket.data;

  // ── game:join ──────────────────────────────────────────────────────
  socket.on("game:join", async ({ gameId }) => {
    try {
      const game = await gameService.getGame(gameId);
      if (!game) {
        socket.emit("error:generic", { code: "NOT_FOUND", message: "Game not found" });
        return;
      }

      const isParticipant =
        game.whitePlayerId === userId || game.blackPlayerId === userId;

      if (!isParticipant) {
        socket.emit("error:generic", { code: "FORBIDDEN", message: "Not a participant" });
        return;
      }

      // Join the game room
      const room = SOCKET_ROOMS.game(gameId);
      socket.join(room);
      socket.data.currentGameId = gameId;

      // Cancel any reconnect timeout
      clockManager.cancelReconnectTimeout(gameId, userId);

      // If opponent was waiting for reconnect, notify them
      const clockState = clockManager.getGameState(gameId);
      if (clockState) {
        const color = game.whitePlayerId === userId ? "white" : "black";
        socket.to(room).emit("game:opponent_reconnected", { gameId, color });
        // Resume clock
        clockManager.resumeClock(gameId);
      }

      // If game is active, start clock if not already running
      if (game.status === "active" && !clockState) {
        const incrementMs = (game.incrementSeconds ?? 0) * 1000;
        clockManager.startClock(
          gameId,
          game.whitePlayerId!,
          game.blackPlayerId,
          game.whiteTimeRemainingMs ?? game.timeControlMinutes * 60000,
          game.blackTimeRemainingMs ?? game.timeControlMinutes * 60000,
          incrementMs,
          "white", // white always starts
          // onTick — broadcast every second
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
            const cs = clockManager.getGameState(gameId);
            const timedOutColor = cs?.activeColor ?? "white";
            await gameService.handleTimeout(gameId, timedOutColor);
            const result = timedOutColor === "white" ? "black_wins" : "white_wins";
            io.to(room).emit("game:ended", {
              gameId,
              result,
              reason: "timeout",
              pgn: "",
            });
          }
        );
      }
    } catch (err) {
      console.error("[game:join]", err);
      socket.emit("error:generic", { code: "INTERNAL", message: "Failed to join game" });
    }
  });

  // ── game:move ──────────────────────────────────────────────────────
  socket.on("game:move", async ({ gameId, from, to, promotion }) => {
    try {
      const room = SOCKET_ROOMS.game(gameId);
      const specRoom = SOCKET_ROOMS.spectator(gameId);

      const clockState = clockManager.getGameState(gameId);
      const timeSpentMs = clockState
        ? Date.now() - clockState.lastTickAt
        : undefined;
      const clockRemainingMs = clockState
        ? clockState.activeColor === "white"
          ? clockState.whiteTimeMs
          : clockState.blackTimeMs
        : undefined;

      const result = await gameService.makeMove({
        gameId,
        userId,
        from,
        to,
        promotion,
        timeSpentMs,
        clockRemainingMs,
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
          moveNumber: 0, // filled by client
          color: (userId === (await gameService.getGame(gameId))?.whitePlayerId
            ? "white"
            : "black") as "white" | "black",
        },
        fen: result.fen!,
        pgn: result.pgn!,
        currentTurn: newClockState?.activeColor ?? "white",
        whiteTimeRemainingMs: newClockState?.whiteTimeMs ?? 0,
        blackTimeRemainingMs: newClockState?.blackTimeMs ?? 0,
      };

      // Broadcast to game room AND spectators
      io.to(room).emit("game:move_made", movePayload);
      io.to(specRoom).emit("game:move_made", movePayload);

      // If game ended
      if (result.gameEnded) {
        clockManager.stopClock(gameId);

        const endPayload = {
          gameId,
          result: result.result!,
          reason: result.resultReason!,
          pgn: result.pgn!,
          whiteRatingChange: result.whiteRatingChange,
          blackRatingChange: result.blackRatingChange,
        };

        io.to(room).emit("game:ended", endPayload);
        io.to(specRoom).emit("game:ended", endPayload);

        // Check and emit achievements
        await emitAchievements(io, gameId, result);
      }
    } catch (err) {
      console.error("[game:move]", err);
      socket.emit("error:generic", { code: "INTERNAL", message: "Move failed" });
    }
  });

  // ── game:resign ────────────────────────────────────────────────────
  socket.on("game:resign", async ({ gameId }) => {
    try {
      const room = SOCKET_ROOMS.game(gameId);
      const specRoom = SOCKET_ROOMS.spectator(gameId);

      const result = await gameService.resign(gameId, userId);
      if (!result.success) {
        socket.emit("error:generic", { code: "BAD_REQUEST", message: result.error! });
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
      io.to(specRoom).emit("game:ended", endPayload);
    } catch (err) {
      console.error("[game:resign]", err);
    }
  });

  // ── game:offer_draw ────────────────────────────────────────────────
  socket.on("game:offer_draw", async ({ gameId }) => {
    const game = await gameService.getGame(gameId);
    if (!game) return;

    const color = game.whitePlayerId === userId ? "white" : "black";
    const room = SOCKET_ROOMS.game(gameId);

    // Notify opponent
    socket.to(room).emit("game:draw_offered", { gameId, byColor: color });
  });

  // ── game:accept_draw ───────────────────────────────────────────────
  socket.on("game:accept_draw", async ({ gameId }) => {
    try {
      const room = SOCKET_ROOMS.game(gameId);
      const specRoom = SOCKET_ROOMS.spectator(gameId);

      const result = await gameService.acceptDraw(gameId);
      if (!result.success) return;

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
      io.to(specRoom).emit("game:ended", endPayload);
    } catch (err) {
      console.error("[game:accept_draw]", err);
    }
  });

  // ── game:decline_draw ──────────────────────────────────────────────
  socket.on("game:decline_draw", async ({ gameId }) => {
    const game = await gameService.getGame(gameId);
    if (!game) return;

    const color = game.whitePlayerId === userId ? "white" : "black";
    const room = SOCKET_ROOMS.game(gameId);

    socket.to(room).emit("game:draw_declined", { gameId, byColor: color });
  });

  // ── game:chat_message ──────────────────────────────────────────────
  socket.on("game:chat_message", ({ gameId, message }) => {
    // Sanitize message
    const sanitized = message.slice(0, 200).trim();
    if (!sanitized) return;

    const room = SOCKET_ROOMS.game(gameId);
    io.to(room).emit("game:chat_message", {
      gameId,
      userId,
      username,
      message: sanitized,
      sentAt: new Date().toISOString(),
    });
  });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function emitAchievements(
  io: AppServer,
  gameId: string,
  result: any
): Promise<void> {
  try {
    const { achievementService } = await import("@/services/achievement.service");
    const { gameService: gs } = await import("@/services/game.service");
    const game = await gs.getGame(gameId);
    if (!game) return;

    const playerIds = [game.whitePlayerId, game.blackPlayerId].filter(Boolean) as string[];

    for (const playerId of playerIds) {
      const newAchievements = await achievementService.checkAndAward(playerId, gameId);

      for (const achievementId of newAchievements) {
        const { db } = await import("@/db");
        const { achievements } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");

        const achievement = await db.query.achievements.findFirst({
          where: eq(achievements.id, achievementId),
        });

        if (achievement) {
          io.to(`user:${playerId}`).emit("achievement:unlocked", {
            achievementId: achievement.id,
            name: achievement.name,
            description: achievement.description,
            iconUrl: achievement.iconUrl ?? undefined,
            points: achievement.points ?? 10,
          });
        }
      }
    }
  } catch (err) {
    console.error("[emitAchievements]", err);
  }
}
