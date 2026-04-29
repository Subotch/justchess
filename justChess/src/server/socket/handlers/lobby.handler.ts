/**
 * Socket.IO lobby event handlers — matchmaking and friend challenges
 */

import type { Socket } from "socket.io";
import type { AppServer } from "../index";
import type { SocketData } from "@/types/socket";
import { matchmakingQueue } from "../matchmaking";
import { gameService } from "@/services/game.service";
import { clockManager } from "../clock-manager";
import { SOCKET_ROOMS } from "@/types/socket";

type AppSocket = Socket<any, any, any, SocketData>;

// In-memory challenge store: challengeId → challenge data
interface Challenge {
  id: string;
  fromUserId: string;
  fromUsername: string;
  fromRating: number;
  toUserId: string;
  timeControlMinutes: number;
  incrementSeconds: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

const pendingChallenges = new Map<string, Challenge>();

export function registerLobbyHandlers(io: AppServer, socket: AppSocket): void {
  // ── lobby:join_queue ─────────────────────────────────────────────────
  socket.on(
    "lobby:join_queue",
    async ({
      gameType,
      timeControlMinutes,
      incrementSeconds,
    }: {
      gameType: "rated" | "casual";
      timeControlMinutes: number;
      incrementSeconds: number;
    }) => {
      try {
        const { userId, username } = socket.data;

        // Get user rating
        const { db } = await import("@/db");
        const { userStats } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const { getTimingCategory } = await import("@/types/game");

        const stats = await db.query.userStats.findFirst({
          where: eq(userStats.userId, userId),
        });

        const timingCategory = getTimingCategory(timeControlMinutes);
        let rating = 1200;
        if (stats) {
          switch (timingCategory) {
            case "bullet": rating = stats.ratingBullet; break;
            case "blitz": rating = stats.ratingBlitz; break;
            case "rapid": rating = stats.ratingRapid; break;
            case "classical": rating = stats.ratingClassical; break;
          }
        }

        const entry = {
          userId,
          username,
          rating,
          request: { gameType, timeControlMinutes, incrementSeconds },
          joinedAt: Date.now(),
        };

        // Try to find a match immediately
        const opponent = matchmakingQueue.findMatch(entry);

        if (opponent) {
          // Create game
          const isWhite = Math.random() < 0.5;
          const game = await gameService.createGame({
            whitePlayerId: isWhite ? userId : opponent.userId,
            blackPlayerId: isWhite ? opponent.userId : userId,
            gameType,
            timeControlMinutes,
            incrementSeconds,
          });

          const myColor = isWhite ? "white" : "black";
          const opponentColor = isWhite ? "black" : "white";

          // Notify both players
          socket.emit("lobby:match_found", {
            gameId: game.id,
            opponent: {
              id: opponent.userId,
              username: opponent.username,
              rating: opponent.rating,
            },
            color: myColor,
          });

          io.to(`user:${opponent.userId}`).emit("lobby:match_found", {
            gameId: game.id,
            opponent: { id: userId, username, rating },
            color: opponentColor,
          });

          socket.data.isInQueue = false;
        } else {
          // Add to queue
          matchmakingQueue.add(entry);
          socket.data.isInQueue = true;
          socket.join("lobby");

          const position = matchmakingQueue.getPosition(userId);
          socket.emit("lobby:queue_update", {
            position,
            estimatedWaitSeconds: position * 15,
          });

// Periodically try to match (every 5 seconds).
          // Clear any previous interval before overwriting to prevent leaks
          // when the player calls lobby:join_queue multiple times.
          if (socket.data.matchInterval) {
            clearInterval(socket.data.matchInterval);
            socket.data.matchInterval = undefined;
          }
          socket.data.matchInterval = setInterval(async () => {
            if (!socket.data.isInQueue) {
              clearInterval(socket.data.matchInterval);
              return;
            }

            // Keep player alive in queue
            matchmakingQueue.heartbeat(userId);

            const updatedEntry = {
              ...entry,
              joinedAt: entry.joinedAt, // keep original join time for range expansion
            };

            const found = matchmakingQueue.findMatch(updatedEntry);
            if (found) {
              clearInterval(socket.data.matchInterval);
              matchmakingQueue.remove(userId);
              socket.data.isInQueue = false;

              const isWhite2 = Math.random() < 0.5;
              const game2 = await gameService.createGame({
                whitePlayerId: isWhite2 ? userId : found.userId,
                blackPlayerId: isWhite2 ? found.userId : userId,
                gameType,
                timeControlMinutes,
                incrementSeconds,
              });

              const myColor2 = isWhite2 ? "white" : "black";
              const opponentColor2 = isWhite2 ? "black" : "white";

              socket.emit("lobby:match_found", {
                gameId: game2.id,
                opponent: { id: found.userId, username: found.username, rating: found.rating },
                color: myColor2,
              });

              io.to(`user:${found.userId}`).emit("lobby:match_found", {
                gameId: game2.id,
                opponent: { id: userId, username, rating },
                color: opponentColor2,
              });
            } else {
              const pos = matchmakingQueue.getPosition(userId);
              if (pos > 0) {
                socket.emit("lobby:queue_update", {
                  position: pos,
                  estimatedWaitSeconds: pos * 15,
                });
              }
            }
          }, 5000);

          // Clean up interval on disconnect
          socket.once("disconnect", () => {
            clearInterval(socket.data.matchInterval);
            matchmakingQueue.remove(userId);
          });
        }
      } catch (err) {
        console.error("[lobby:join_queue]", err);
        socket.emit("error:generic", { code: "INTERNAL", message: "Failed to join queue" });
      }
    }
  );

  // ── lobby:leave_queue ────────────────────────────────────────────────
  socket.on("lobby:leave_queue", () => {
    clearInterval(socket.data.matchInterval);
    matchmakingQueue.remove(socket.data.userId);
    socket.data.isInQueue = false;
    socket.leave("lobby");
  });

  // ── lobby:challenge_friend ───────────────────────────────────────────
  socket.on(
    "lobby:challenge_friend",
    async ({
      friendId,
      timeControlMinutes,
      incrementSeconds,
    }: {
      friendId: string;
      timeControlMinutes: number;
      incrementSeconds: number;
    }) => {
      try {
        const { userId, username } = socket.data;

        // Get challenger rating
        const { db } = await import("@/db");
        const { userStats } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const { getTimingCategory } = await import("@/types/game");

        const stats = await db.query.userStats.findFirst({
          where: eq(userStats.userId, userId),
        });
        const timingCategory = getTimingCategory(timeControlMinutes);
        let rating = 1200;
        if (stats) {
          switch (timingCategory) {
            case "bullet": rating = stats.ratingBullet; break;
            case "blitz": rating = stats.ratingBlitz; break;
            case "rapid": rating = stats.ratingRapid; break;
            case "classical": rating = stats.ratingClassical; break;
          }
        }

        const challengeId = `challenge_${Date.now()}_${userId}`;
        const expiresAt = Date.now() + 60_000; // 60 seconds to accept

        const timer = setTimeout(() => {
          pendingChallenges.delete(challengeId);
        }, 60_000);

        const challenge: Challenge = {
          id: challengeId,
          fromUserId: userId,
          fromUsername: username,
          fromRating: rating,
          toUserId: friendId,
          timeControlMinutes,
          incrementSeconds,
          expiresAt,
          timer,
        };

        pendingChallenges.set(challengeId, challenge);

        // Notify the friend - use try-catch to avoid errors if friend is offline
        try {
          io.to(`user:${friendId}`).emit("lobby:challenge_received", {
            challengeId,
            from: { id: userId, username, rating },
            timeControlMinutes,
            incrementSeconds,
            expiresAt: new Date(expiresAt).toISOString(),
          });
        } catch (emitErr) {
          console.error("[lobby:challenge_friend] Failed to notify friend:", emitErr);
          socket.emit("error:generic", { code: "INTERNAL", message: "Failed to send challenge" });
          return;
        }
      } catch (err) {
        console.error("[lobby:challenge_friend]", err);
        socket.emit("error:generic", { code: "INTERNAL", message: "Failed to send challenge" });
      }
    }
  );

  // ── lobby:accept_challenge ───────────────────────────────────────────
  socket.on(
    "lobby:accept_challenge",
    async ({ challengeId }: { challengeId: string }) => {
      try {
        const challenge = pendingChallenges.get(challengeId);
        if (!challenge) {
          socket.emit("error:generic", { code: "NOT_FOUND", message: "Challenge not found or expired" });
          return;
        }

        if (challenge.toUserId !== socket.data.userId) {
          socket.emit("error:generic", { code: "FORBIDDEN", message: "Not your challenge" });
          return;
        }

        // Clear expiry timer
        clearTimeout(challenge.timer);
        pendingChallenges.delete(challengeId);

        // Get fresh ratings from DB for both players
        const { db } = await import("@/db");
        const { userStats } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const { getTimingCategory } = await import("@/types/game");

        const timingCategory = getTimingCategory(challenge.timeControlMinutes);

        // Fetch fromUser rating
        const fromStats = await db.query.userStats.findFirst({
          where: eq(userStats.userId, challenge.fromUserId),
        });
        let fromRating = 1200;
        if (fromStats) {
          switch (timingCategory) {
            case "bullet": fromRating = fromStats.ratingBullet; break;
            case "blitz": fromRating = fromStats.ratingBlitz; break;
            case "rapid": fromRating = fromStats.ratingRapid; break;
            case "classical": fromRating = fromStats.ratingClassical; break;
          }
        }

        // Fetch toUser rating
        const toStats = await db.query.userStats.findFirst({
          where: eq(userStats.userId, challenge.toUserId),
        });
        let toRating = 1200;
        if (toStats) {
          switch (timingCategory) {
            case "bullet": toRating = toStats.ratingBullet; break;
            case "blitz": toRating = toStats.ratingBlitz; break;
            case "rapid": toRating = toStats.ratingRapid; break;
            case "classical": toRating = toStats.ratingClassical; break;
          }
        }

        // Create game (challenger is white by default, or random)
        const isWhite = Math.random() < 0.5;
        const game = await gameService.createGame({
          whitePlayerId: isWhite ? challenge.fromUserId : challenge.toUserId,
          blackPlayerId: isWhite ? challenge.toUserId : challenge.fromUserId,
          gameType: "friendly",
          timeControlMinutes: challenge.timeControlMinutes,
          incrementSeconds: challenge.incrementSeconds,
        });

        if (!game) {
          throw new Error("Failed to create game");
        }

        // Do NOT start the game here — let game:join handle it when both players
        // enter the room. This avoids duplicate game:started emissions and keeps
        // the clock off until participants are actually in the room.

        // Notify both players with just the gameId so they can navigate.
        socket.emit("lobby:challenge_accepted", { challengeId, gameId: game.id });
        
        // Notify challenger - use try-catch to avoid errors if user is offline
        try {
          io.to(`user:${challenge.fromUserId}`).emit("lobby:challenge_accepted", {
            challengeId,
            gameId: game.id,
          });
        } catch (emitErr) {
          // Challenger may be offline - log but don't fail the accept
          console.warn("[lobby:accept_challenge] Failed to notify challenger:", emitErr);
        }
      } catch (err) {
        console.error("[lobby:accept_challenge]", err);
        socket.emit("error:generic", { code: "INTERNAL", message: "Failed to accept challenge" });
      }
    }
  );

  // ── lobby:decline_challenge ──────────────────────────────────────────
  socket.on(
    "lobby:decline_challenge",
    ({ challengeId }: { challengeId: string }) => {
      const challenge = pendingChallenges.get(challengeId);
      if (!challenge) return;

      clearTimeout(challenge.timer);
      pendingChallenges.delete(challengeId);

      // Notify challenger - use try-catch to avoid errors if user is offline
      try {
        io.to(`user:${challenge.fromUserId}`).emit("lobby:challenge_declined", {
          challengeId,
        });
      } catch (emitErr) {
        console.warn("[lobby:decline_challenge] Failed to notify challenger:", emitErr);
      }
    }
  );
}
