/**
 * Socket.IO spectator event handlers
 */

import type { Socket } from "socket.io";
import type { AppServer } from "../index";
import type { SocketData } from "@/types/socket";
import { SOCKET_ROOMS } from "@/types/socket";
import { gameService } from "@/services/game.service";

type AppSocket = Socket<any, any, any, SocketData>;

export function registerSpectatorHandlers(io: AppServer, socket: AppSocket): void {
  // ── spectator:join ───────────────────────────────────────────────────
  socket.on("spectator:join", async ({ gameId }: { gameId: string }) => {
    try {
      const game = await gameService.getGame(gameId);
      if (!game) {
        socket.emit("error:generic", { code: "NOT_FOUND", message: "Game not found" });
        return;
      }

      if (game.status !== "active") {
        socket.emit("error:generic", { code: "BAD_REQUEST", message: "Game is not live" });
        return;
      }

      const specRoom = SOCKET_ROOMS.spectator(gameId);
      socket.join(specRoom);
      socket.data.spectatingGameId = gameId;

      // Count spectators and notify game room
      const specSockets = await io.in(specRoom).fetchSockets();
      const count = specSockets.length;

      io.to(SOCKET_ROOMS.game(gameId)).emit("spectator:count_update", { gameId, count });
      io.to(specRoom).emit("spectator:count_update", { gameId, count });

      // Update peak spectators in DB (fire-and-forget)
      import("@/db").then(({ db }) =>
        import("@/db/schema").then(({ games }) =>
          import("drizzle-orm").then(({ eq, sql }) =>
            db
              .update(games)
              .set({
                peakSpectators: sql`GREATEST(${games.peakSpectators}, ${count})`,
              })
              .where(eq(games.id, gameId))
              .catch(console.error)
          )
        )
      );
    } catch (err) {
      console.error("[spectator:join]", err);
      socket.emit("error:generic", { code: "INTERNAL", message: "Failed to join as spectator" });
    }
  });

  // ── spectator:leave ──────────────────────────────────────────────────
  socket.on("spectator:leave", async ({ gameId }: { gameId: string }) => {
    try {
      const specRoom = SOCKET_ROOMS.spectator(gameId);
      socket.leave(specRoom);
      socket.data.spectatingGameId = undefined;

      // Update spectator count
      const specSockets = await io.in(specRoom).fetchSockets();
      const count = specSockets.length;

      io.to(SOCKET_ROOMS.game(gameId)).emit("spectator:count_update", { gameId, count });
      io.to(specRoom).emit("spectator:count_update", { gameId, count });
    } catch (err) {
      console.error("[spectator:leave]", err);
    }
  });
}
