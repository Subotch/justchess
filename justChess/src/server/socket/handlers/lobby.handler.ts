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

          // Periodically try to match (every 5 seconds)
          const matchInterval = setInterval(async () => {
            if (!socket.data.isInQueue) {
              clearInterval(matchInterval);
              return;
            }

            const updatedEntry = {
              ...entry,
              joinedAt: entry.joinedAt, // keep original join time for range expansion
            };

            const found = matchmakingQueue.findMatch(updatedEntry);
            if (found) {
              clearInterval(matchInterval);
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
            clearInterval(matchInterval);
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

        // Notify the friend
        io.to(`user:${friendId}`).emit("lobby:challenge_received", {
          challengeId,
          from: { id: userId, username, rating },
          timeControlMinutes,
          incrementSeconds,
          expiresAt: new Date(expiresAt).toISOString(),
        });
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

        // Create game (challenger is white by default, or random)
        const isWhite = Math.random() < 0.5;
        const game = await gameService.createGame({
          whitePlayerId: isWhite ? challenge.fromUserId : challenge.toUserId,
          blackPlayerId: isWhite ? challenge.toUserId : challenge.fromUserId,
          gameType: "casual",
          timeControlMinutes: challenge.timeControlMinutes,
          incrementSeconds: challenge.incrementSeconds,
        });

        // Start the game immediately
        const startedGame = await gameService.startGame(game.id);

        // Start clock manager
        const timeMs = challenge.timeControlMinutes * 60 * 1000;
        const incrementMs = challenge.incrementSeconds * 1000;

        clockManager.startClock(
          game.id,
          isWhite ? challenge.fromUserId : challenge.toUserId,
          isWhite ? challenge.toUserId : challenge.fromUserId,
          timeMs,
          timeMs,
          incrementMs,
          "white",
          // onTick — broadcast clock every second
          ({ whiteTimeMs, blackTimeMs, activeColor }) => {
            io.to(SOCKET_ROOMS.game(game.id)).emit("game:clock_update", {
              gameId: game.id,
              whiteTimeRemainingMs: whiteTimeMs,
              blackTimeRemainingMs: blackTimeMs,
              activeColor,
            });
          },
          // onTimeout
          async () => {
            const clockState = clockManager.getGameState(game.id);
            if (!clockState) return;
            const timedOut = clockState.whiteTimeMs <= 0 ? "white" : "black";
            await gameService.handleTimeout(game.id, timedOut);
            const result = timedOut === "white" ? "black_wins" : "white_wins";
            io.to(SOCKET_ROOMS.game(game.id)).emit("game:ended", {
              gameId: game.id,
              result,
              reason: "timeout",
              pgn: "",
            });
          }
        );

        const gameState = {
          id: startedGame.id,
          status: "active" as const,
          gameType: "casual" as const,
          timingCategory: startedGame.timingCategory as any,
          timeControlMinutes: startedGame.timeControlMinutes,
          incrementSeconds: startedGame.incrementSeconds,
          white: {
            id: isWhite ? challenge.fromUserId : challenge.toUserId,
            username: isWhite ? challenge.fromUsername : socket.data.username,
            name: isWhite ? challenge.fromUsername : socket.data.username,
            image: null,
            rating: isWhite ? challenge.fromRating : 1200,
            color: "white" as const,
            timeRemainingMs: timeMs,
            isConnected: true,
          },
          black: {
            id: isWhite ? challenge.toUserId : challenge.fromUserId,
            username: isWhite ? socket.data.username : challenge.fromUsername,
            name: isWhite ? socket.data.username : challenge.fromUsername,
            image: null,
            rating: isWhite ? 1200 : challenge.fromRating,
            color: "black" as const,
            timeRemainingMs: timeMs,
            isConnected: true,
          },
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          pgn: "",
          moves: [],
          currentTurn: "white" as const,
          moveCount: 0,
          result: "in_progress" as const,
          isAiGame: false,
          spectatorCount: 0,
          startedAt: startedGame.startedAt?.toISOString(),
          createdAt: startedGame.createdAt.toISOString(),
        };

        // Notify both players
        socket.emit("lobby:challenge_accepted", { challengeId, gameId: game.id });
        io.to(`user:${challenge.fromUserId}`).emit("lobby:challenge_accepted", {
          challengeId,
          gameId: game.id,
        });

        // Send game:started to both players
        io.to(`user:${challenge.fromUserId}`).emit("game:started", { game: gameState });
        socket.emit("game:started", { game: gameState });
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

      io.to(`user:${challenge.fromUserId}`).emit("lobby:challenge_declined", {
        challengeId,
      });
    }
  );
}
