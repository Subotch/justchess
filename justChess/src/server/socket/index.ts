/**
 * Socket.IO server — registers all event handlers
 * Called from server.js on startup
 */

import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "@/types/socket";
import { registerGameHandlers } from "./handlers/game.handler";
import { registerLobbyHandlers } from "./handlers/lobby.handler";
import { registerSpectatorHandlers } from "./handlers/spectator.handler";
import { authenticateSocket } from "./middleware/auth.middleware";
import { clockManager } from "./clock-manager";

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function registerSocketHandlers(io: AppServer): void {
  // ── Authentication middleware ──────────────────────────────────────
  io.use(authenticateSocket);

  // ── Connection handler ─────────────────────────────────────────────
  io.on("connection", (socket) => {
    const { userId, username } = socket.data;
    console.log(`[Socket] Connected: ${username} (${userId}) — ${socket.id}`);

    // Join personal room for direct notifications
    socket.join(`user:${userId}`);

    // Register domain-specific handlers
    registerGameHandlers(io, socket);
    registerLobbyHandlers(io, socket);
    registerSpectatorHandlers(io, socket);

    // ── Disconnect ───────────────────────────────────────────────────
    socket.on("disconnect", async (reason) => {
      console.log(`[Socket] Disconnected: ${username} — ${reason}`);

      // If player was in a game, notify opponent and start reconnect timer
      if (socket.data.currentGameId) {
        const gameId = socket.data.currentGameId;
        const room = `game:room:${gameId}`;

        // Determine color
        const gameState = clockManager.getGameState(gameId);
        if (gameState) {
          const color =
            gameState.whitePlayerId === userId ? "white" : "black";

          // Notify room
          io.to(room).emit("game:opponent_disconnected", {
            gameId,
            color,
            reconnectDeadlineMs: Date.now() + 60_000, // 60s to reconnect
          });

          // Schedule forfeit if no reconnect within 60s
          clockManager.scheduleReconnectTimeout(gameId, userId, 60_000, async () => {
            const { gameService } = await import("@/services/game.service");
            await gameService.resign(gameId, userId);
            io.to(room).emit("game:ended", {
              gameId,
              result: color === "white" ? "black_wins" : "white_wins",
              reason: "abandoned",
              pgn: "",
            });
          });
        }
      }

      // Mark user offline in DB (fire-and-forget)
      import("@/db").then(({ db }) =>
        import("@/db/schema").then(({ users }) =>
          db
            .update(users)
            .set({ isOnline: false, lastSeenAt: new Date() })
            .where(import("drizzle-orm").then(({ eq }) => eq(users.id, userId)))
            .catch(console.error)
        )
      );
    });
  });

  console.log("[Socket.IO] Handlers registered");
}
