/**
 * Socket.IO lobby handlers — matchmaking and friend challenges
 */

import type { Socket } from "socket.io";
import type { AppServer } from "../index";
import type { SocketData } from "@/types/socket";
import { matchmakingQueue } from "../matchmaking";
import { SOCKET_ROOMS } from "@/types/socket";

type AppSocket = Socket<any, any, any, SocketData>;

export function registerLobbyHandlers(io: AppServer, socket: AppSocket): void {
  const { userId, username } = socket.data;

  // ── lobby:join_queue ───────────────────────────────────────────────
  socket.on("lobby:join_queue", async ({ gameType, timeControlMinutes, incrementSeconds }) => {
    if (socket.data.isInQueue) return;
    if (socket.data.currentGameId) {
      socket.emit("error:generic", {
        code: "ALREADY_IN_GAME",
        message: "You are already in a game",
      });
      return;
    }

    socket.data.isInQueue = true;
    socket.join(SOCKET_ROOMS.lobby);

    // Get user rating
    const { db } = await import("@/db");
    const { userStats } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { getTimingCategory } = await import("@/types/game");

    const stats = await db.query.userStats.findFirst({
      where: eq(userStats.userId, userId),
    });

    const timingCategory = getTimingCategory(timeControlMinutes);
    const rating =
      timingCategory === "bullet"
        ? stats?.ratingBullet ?? 1200
        : timingCategory === "blitz"
        ? stats?.ratingBlitz ?? 1200
        : timingCategory === "rapid"
        ? stats?.ratingRapid ?? 1200
        : stats?.ratingClassical ?? 1200;

    // Try to find a match
    const match = matchmakingQueue.findMatch({
      userId,
      username,
      rating,
      request: { gameType, timeControlMinutes, incrementSeconds },
      joinedAt: Date.now(),
    });

    if (match) {
      // Create game
      const { gameService } = await import("@/services/game.service");

      // Randomly assign colors
      const whiteIsRequester = Math.random() < 0.5;
      const whiteId = whiteIsRequester ? userId : match.userId;
      const blackId = whiteIsRequester ? match.userId : userId;

      const game = await gameService.createGame({
        whitePlayerId: whiteId,
        blackPlayerId: blackId,
        gameType,
        timeControlMinutes,
        incrementSeconds,
      });

      await gameService.startGame(game.id);

      // Notify both players
      const myColor = whiteIsRequester ? "white" : "black";
      const opponentColor = whiteIsRequester ? "black" : "white";

      socket.emit("lobby:match_found", {
        gameId: game.id,
        opponent: { id: match.userId, username: match.username, rating: match.rating },
        color: myColor,
      });

      io.to(`user:${match.userId}`).emit("lobby:match_found", {
        gameId: game.id,
        opponent: { id: userId, username, rating },
        color: opponentColor,
      });

      socket.data.isInQueue = false;
      socket.leave(SOCKET_ROOMS.lobby);
    } else {
      // Add to queue
      matchmakingQueue.add({
        userId,
        username,
        rating,
        request: { gameType, timeControlMinutes, incrementSeconds },
        joinedAt: Date.now(),
      });

      socket.emit("lobby:queue_update", {
        position: matchmakingQueue.getPosition(userId),
        estimatedWaitSeconds: 30,
      });
    }
  });

  // ── lobby:leave_queue ──────────────────────────────────────────────
  socket.on("lobby:leave_queue", () => {
    matchmakingQueue.remove(userId);
    socket.data.isInQueue = false;
    socket.leave(SOCKET_ROOMS.lobby);
  });

  // ── lobby:challenge_friend ─────────────────────────────────────────
  socket.on("lobby:challenge_friend", async ({ friendId, timeControlMinutes, incrementSeconds }) => {
    const challengeId = `challenge_${Date.now()}_${userId}`;
    const expiresAt = new Date(Date.now() + 60_000).toISOString(); // 60s to accept

    // Get challenger rating
    const { db } = await import("@/db");
    const { userStats } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const stats = await db.query.userStats.findFirst({
      where: eq(userStats.userId, userId),
    });

    io.to(`user:${friendId}`).emit("lobby:challenge_received", {
      challengeId,
      from: { id: userId, username, rating: stats?.ratingRapid ?? 1200 },
      timeControlMinutes,
      incrementSeconds,
      expiresAt,
    });
  });

  // ── lobby:accept_challenge ─────────────────────────────────────────
  socket.on("lobby:accept_challenge", async ({ challengeId }) => {
    // Extract challenger userId from challengeId
    const parts = challengeId.split("_");
    const challengerId = parts[2];

    const { gameService } = await import("@/services/game.service");

    // Create game (challenger is white by default, or random)
    const whiteIsChallenger = Math.random() < 0.5;
    const game = await gameService.createGame({
      whitePlayerId: whiteIsChallenger ? challengerId : userId,
      blackPlayerId: whiteIsChallenger ? userId : challengerId,
      gameType: "casual",
      timeControlMinutes: 10,
      incrementSeconds: 0,
    });

    await gameService.startGame(game.id);

    socket.emit("lobby:challenge_accepted", { challengeId, gameId: game.id });
    io.to(`user:${challengerId}`).emit("lobby:challenge_accepted", {
      challengeId,
      gameId: game.id,
    });
  });

  // ── lobby:decline_challenge ────────────────────────────────────────
  socket.on("lobby:decline_challenge", ({ challengeId }) => {
    const parts = challengeId.split("_");
    const challengerId = parts[2];

    io.to(`user:${challengerId}`).emit("lobby:challenge_declined", { challengeId });
  });
}
