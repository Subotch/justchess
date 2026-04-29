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
  console.log("[lobby:handlers] Registered for socket:", socket.id);
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
  console.log("[lobby:handlers] Registering lobby:accept_challenge handler");
  socket.on(
    "lobby:accept_challenge",
    async ({ challengeId }: { challengeId: string }) => {
      console.log("[lobby:accept_challenge] EVENT FIRED! challengeId:", challengeId);
      console.log("[lobby:accept_challenge] io object:", typeof io, io !== undefined);
      try {
        console.log("[lobby:accept_challenge] Received challengeId:", challengeId);
        console.log("[lobby:accept_challenge] Current user:", socket.data.userId);
        
        const challenge = pendingChallenges.get(challengeId);
        console.log("[lobby:accept_challenge] Challenge found:", !!challenge);
        
        if (!challenge) {
          console.error("[lobby:accept_challenge] Challenge not found or expired");
          socket.emit("error:generic", { code: "NOT_FOUND", message: "Challenge not found or expired" });
          return;
        }

        console.log("[lobby:accept_challenge] Challenge details:", {
          fromUserId: challenge.fromUserId,
          toUserId: challenge.toUserId,
          timeControlMinutes: challenge.timeControlMinutes,
          incrementSeconds: challenge.incrementSeconds,
        });

        if (challenge.toUserId !== socket.data.userId) {
          console.error("[lobby:accept_challenge] Not your challenge");
          socket.emit("error:generic", { code: "FORBIDDEN", message: "Not your challenge" });
          return;
        }

        // Clear expiry timer
        clearTimeout(challenge.timer);
        pendingChallenges.delete(challengeId);
        console.log("[lobby:accept_challenge] Challenge removed from pending");

        // Get fresh ratings from DB for both players
        const { db } = await import("@/db");
        const { userStats } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const { getTimingCategory } = await import("@/types/game");

        const timingCategory = getTimingCategory(challenge.timeControlMinutes);
        console.log("[lobby:accept_challenge] Timing category:", timingCategory);

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
        console.log("[lobby:accept_challenge] From rating:", fromRating);

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
        console.log("[lobby:accept_challenge] To rating:", toRating);

        // Create game (challenger is white by default, or random)
        const isWhite = Math.random() < 0.5;
        console.log("[lobby:accept_challenge] Creating game - isWhite:", isWhite);

        // Determine if 'friendly' enum value is available in DB; fall back to 'casual'
        let resolvedGameType: "friendly" | "casual" = "friendly";
        try {
          const { sql: sqlRaw } = await import("drizzle-orm");
          const result = await db.execute(sqlRaw`SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'game_type' AND e.enumlabel = 'friendly'`);
          if (!result.rows || result.rows.length === 0) {
            console.warn("[lobby:accept_challenge] 'friendly' enum not in DB, falling back to 'casual'. Run: npm run db:migrate");
            resolvedGameType = "casual";
          }
        } catch (enumCheckErr) {
          console.warn("[lobby:accept_challenge] Could not check enum, using 'casual' fallback:", enumCheckErr);
          resolvedGameType = "casual";
        }

        const game = await gameService.createGame({
          whitePlayerId: isWhite ? challenge.fromUserId : challenge.toUserId,
          blackPlayerId: isWhite ? challenge.toUserId : challenge.fromUserId,
          gameType: resolvedGameType,
          timeControlMinutes: challenge.timeControlMinutes,
          incrementSeconds: challenge.incrementSeconds,
        });

        console.log("[lobby:accept_challenge] Game created:", !!game, game?.id);

        if (!game) {
          console.error("[lobby:accept_challenge] Failed to create game - returned undefined");
          socket.emit("error:generic", { code: "INTERNAL", message: "Failed to create game record" });
          return;
        }

        // Notify both players with just the gameId so they can navigate.
        console.log("[lobby:accept_challenge] Sending challenge_accepted to acceptor");
        socket.emit("lobby:challenge_accepted", { challengeId, gameId: game.id });
        
        // Notify challenger via their user room
        console.log("[lobby:accept_challenge] About to notify challenger:", challenge.fromUserId);
        console.log("[lobby:accept_challenge] io type:", typeof io);
        console.log("[lobby:accept_challenge] io.to type:", typeof io.to);
        
        const challengerRoom = `user:${challenge.fromUserId}`;
        console.log("[lobby:accept_challenge] Challenger room:", challengerRoom);
        
        try {
          io.to(challengerRoom).emit("lobby:challenge_accepted", {
            challengeId,
            gameId: game.id,
          });
          console.log("[lobby:accept_challenge] Successfully notified challenger");
        } catch (emitErr) {
          console.error("[lobby:accept_challenge] ERROR notifying challenger:", emitErr);
          // Don't fail the accept - challenger may be offline
        }
        
        console.log("[lobby:accept_challenge] SUCCESS - Game ID:", game.id);
      } catch (err) {
        console.error("[lobby:accept_challenge] UNCAUGHT ERROR:", err);
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
