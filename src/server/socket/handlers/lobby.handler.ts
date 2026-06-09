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
import { db } from "@/db";
import { userStats } from "@/db/schema";
import { eq, sql as sqlRaw } from "drizzle-orm";
import { getTimingCategory } from "@/types/game";
import { logger } from "@/server/logger";

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

/**
 * Clear matchmaking queue state on all sockets of a given user.
 * Called when a match is found for a user that was waiting in the queue.
 */
async function clearQueueSocketState(io: AppServer, userId: string): Promise<void> {
  try {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    for (const s of sockets) {
      const data = (s as any).data;
      if (data) {
        clearInterval(data.matchInterval);
        data.matchInterval = undefined;
        data.isInQueue = false;
      }
      try {
        (s as any).leave("lobby");
      } catch {}
    }
  } catch (err) {
    logger.error({ err, userId }, "[lobby] Failed to clear queue state for user");
  }
}

export function registerLobbyHandlers(io: AppServer, socket: AppSocket): void {
  logger.info({ socketId: socket.id }, "[lobby:handlers] Registered");
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

          // Clear queue state for opponent (they were waiting in queue)
          await clearQueueSocketState(io, opponent.userId);
          // Clear queue state for current socket too
          socket.data.isInQueue = false;
          socket.leave("lobby");

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
              socket.data.matchInterval = undefined;
              matchmakingQueue.remove(userId);
              socket.data.isInQueue = false;
              socket.leave("lobby");

              // Clear queue state for found opponent too
              await clearQueueSocketState(io, found.userId);

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
        logger.error({ err }, "[lobby:join_queue]");
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
          logger.error({ err: emitErr }, "[lobby:challenge_friend] Failed to notify friend");
          socket.emit("error:generic", { code: "INTERNAL", message: "Failed to send challenge" });
          return;
        }
      } catch (err) {
        logger.error({ err }, "[lobby:challenge_friend]");
        socket.emit("error:generic", { code: "INTERNAL", message: "Failed to send challenge" });
      }
    }
  );

  // ── lobby:accept_challenge ───────────────────────────────────────────
  socket.on(
    "lobby:accept_challenge",
    async ({ challengeId }: { challengeId: string }) => {
      logger.info({ challengeId, userId: socket.data.userId }, "[lobby:accept_challenge] received");
      try {
        const challenge = pendingChallenges.get(challengeId);

        if (!challenge) {
          logger.error({ challengeId }, "[lobby:accept_challenge] Challenge not found or expired");
          socket.emit("error:generic", { code: "NOT_FOUND", message: "Challenge not found or expired" });
          return;
        }

        if (challenge.toUserId !== socket.data.userId) {
          logger.error({ challengeId }, "[lobby:accept_challenge] Not your challenge");
          socket.emit("error:generic", { code: "FORBIDDEN", message: "Not your challenge" });
          return;
        }

        // Clear expiry timer
        clearTimeout(challenge.timer);
        pendingChallenges.delete(challengeId);

        // Get fresh ratings from DB for both players
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
        // Create game (random color assignment)
        const isWhite = Math.random() < 0.5;

        // Determine if 'friendly' enum value is available in DB; fall back to 'casual'
        let resolvedGameType: "friendly" | "casual" = "friendly";
        try {
          const result = await db.execute(sqlRaw`SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'game_type' AND e.enumlabel = 'friendly'`) as unknown as { rows: { enumlabel: string }[] };
          if (!result.rows || result.rows.length === 0) {
            logger.warn("[lobby:accept_challenge] 'friendly' enum not in DB, falling back to 'casual'. Run: npm run db:migrate");
            resolvedGameType = "casual";
          }
        } catch (enumCheckErr) {
          logger.warn({ err: enumCheckErr }, "[lobby:accept_challenge] Could not check enum, using 'casual' fallback");
          resolvedGameType = "casual";
        }

        const game = await gameService.createGame({
          whitePlayerId: isWhite ? challenge.fromUserId : challenge.toUserId,
          blackPlayerId: isWhite ? challenge.toUserId : challenge.fromUserId,
          gameType: resolvedGameType,
          timeControlMinutes: challenge.timeControlMinutes,
          incrementSeconds: challenge.incrementSeconds,
        });

        if (!game) {
          logger.error({ challengeId }, "[lobby:accept_challenge] Failed to create game - returned undefined");
          socket.emit("error:generic", { code: "INTERNAL", message: "Failed to create game record" });
          return;
        }

        // Notify both players with just the gameId so they can navigate.
        socket.emit("lobby:challenge_accepted", { challengeId, gameId: game.id });

        try {
          io.to(`user:${challenge.fromUserId}`).emit("lobby:challenge_accepted", {
            challengeId,
            gameId: game.id,
          });
        } catch (emitErr) {
          logger.error({ err: emitErr }, "[lobby:accept_challenge] ERROR notifying challenger");
        }

        logger.info({ gameId: game.id }, "[lobby:accept_challenge] SUCCESS");
      } catch (err) {
        logger.error({ err }, "[lobby:accept_challenge] UNCAUGHT ERROR");
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
        logger.warn({ err: emitErr }, "[lobby:decline_challenge] Failed to notify challenger");
      }
    }
  );
}
