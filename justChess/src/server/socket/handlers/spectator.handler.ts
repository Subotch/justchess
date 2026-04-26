/**
 * Socket.IO spectator handlers
 */

import type { Socket } from "socket.io";
import type { AppServer } from "../index";
import type { SocketData } from "@/types/socket";
import { SOCKET_ROOMS } from "@/types/socket";

type AppSocket = Socket<any, any, any, SocketData>;

export function registerSpectatorHandlers(io: AppServer, socket: AppSocket): void {
  // ── spectator:join ─────────────────────────────────────────────────
  socket.on("spectator:join", async ({ gameId }) => {
    const specRoom = SOCKET_ROOMS.spectator(gameId);
    socket.join(specRoom);
    socket.data.spectatingGameId = gameId;

    // Count spectators and notify room
    const spectatorCount = (await io.in(specRoom).fetchSockets()).length;
    io.to(specRoom).emit("spectator:count_update", { gameId, count: spectatorCount });
    io.to(SOCKET_ROOMS.game(gameId)).emit("spectator:count_update", {
      gameId,
      count: spectatorCount,
    });
  });

  // ── spectator:leave ────────────────────────────────────────────────
  socket.on("spectator:leave", async ({ gameId }) => {
    const specRoom = SOCKET_ROOMS.spectator(gameId);
    socket.leave(specRoom);
    socket.data.spectatingGameId = undefined;

    const spectatorCount = (await io.in(specRoom).fetchSockets()).length;
    io.to(specRoom).emit("spectator:count_update", { gameId, count: spectatorCount });
    io.to(SOCKET_ROOMS.game(gameId)).emit("spectator:count_update", {
      gameId,
      count: spectatorCount,
    });
  });
}
