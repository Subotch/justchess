/**
 * useSocket — Socket.IO client hook
 * Manages connection lifecycle and event subscriptions
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useGameStore } from "@/stores/game-store";
import { useLobbyStore } from "@/stores/lobby-store";
import { notify } from "@/stores/notification-store";
import type { ClientToServerEvents, ServerToClientEvents } from "@/types/socket";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: AppSocket | null = null;

function getSocket(): AppSocket {
  if (!socketInstance) {
    socketInstance = io(process.env.NEXT_PUBLIC_APP_URL ?? "", {
      path: "/api/socket",
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    }) as AppSocket;
  }
  return socketInstance;
}

export function useSocket() {
  const socketRef = useRef<AppSocket | null>(null);
  const {
    setGame,
    applyMove,
    updateClocks,
    setGameEnded,
    setDrawOffered,
    clearDrawOffer,
    setOpponentDisconnected,
    setOpponentReconnected,
    setSpectatorCount,
  } = useGameStore();
  const { leaveQueue, updateQueuePosition, setPendingChallenge } = useLobbyStore();

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    if (!socket.connected) {
      socket.connect();
    }

    // ── Game events ──────────────────────────────────────────────────
    socket.on("game:started", (data) => {
      setGame(data.game);
      notify.info("Game started!", `Playing as ${data.color}`);
    });

    socket.on("game:move_made", (data) => {
      applyMove(data.move, data.fen, data.pgn, data.currentTurn);
    });

    socket.on("game:clock_update", (data) => {
      updateClocks(data.whiteMs, data.blackMs);
    });

    socket.on("game:ended", (data) => {
      setGameEnded(data.result, data.reason);
      clearDrawOffer();
    });

    socket.on("game:draw_offered", (data) => {
      setDrawOffered(data.byColor);
      notify.info("Draw offered", "Your opponent offers a draw");
    });

    socket.on("game:draw_declined", () => {
      clearDrawOffer();
      notify.info("Draw declined", "Your opponent declined the draw offer");
    });

    socket.on("game:opponent_disconnected", (data) => {
      setOpponentDisconnected(data.reconnectDeadlineMs);
      notify.warning("Opponent disconnected", "Waiting for reconnection...");
    });

    socket.on("game:opponent_reconnected", () => {
      setOpponentReconnected();
      notify.success("Opponent reconnected");
    });

    socket.on("spectator:count_update", (data) => {
      setSpectatorCount(data.count);
    });

    // ── Lobby events ─────────────────────────────────────────────────
    socket.on("lobby:match_found", (data) => {
      leaveQueue();
      notify.success("Match found!", `Playing against ${data.opponent.username}`);
    });

    socket.on("lobby:queue_update", (data) => {
      updateQueuePosition(data.position, data.estimatedWaitSeconds);
    });

    socket.on("lobby:challenge_received", (data) => {
      setPendingChallenge(data);
      notify.info(
        "Challenge received!",
        `${data.from.username} challenges you to a ${data.timeControlMinutes}+${data.incrementSeconds} game`
      );
    });

    // ── Error events ─────────────────────────────────────────────────
    socket.on("error:invalid_move", (data) => {
      notify.error("Invalid move", data.message);
    });

    socket.on("error:generic", (data) => {
      notify.error("Error", data.message);
    });

    return () => {
      socket.off("game:started");
      socket.off("game:move_made");
      socket.off("game:clock_update");
      socket.off("game:ended");
      socket.off("game:draw_offered");
      socket.off("game:draw_declined");
      socket.off("game:opponent_disconnected");
      socket.off("game:opponent_reconnected");
      socket.off("spectator:count_update");
      socket.off("lobby:match_found");
      socket.off("lobby:queue_update");
      socket.off("lobby:challenge_received");
      socket.off("error:invalid_move");
      socket.off("error:generic");
    };
  }, []);

  const joinGame = useCallback((gameId: string) => {
    socketRef.current?.emit("game:join", { gameId });
  }, []);

  const makeMove = useCallback(
    (gameId: string, from: string, to: string, promotion?: string) => {
      socketRef.current?.emit("game:move", { gameId, from, to, promotion });
    },
    []
  );

  const resign = useCallback((gameId: string) => {
    socketRef.current?.emit("game:resign", { gameId });
  }, []);

  const offerDraw = useCallback((gameId: string) => {
    socketRef.current?.emit("game:offer_draw", { gameId });
  }, []);

  const acceptDraw = useCallback((gameId: string) => {
    socketRef.current?.emit("game:accept_draw", { gameId });
  }, []);

  const declineDraw = useCallback((gameId: string) => {
    socketRef.current?.emit("game:decline_draw", { gameId });
  }, []);

  const joinQueue = useCallback(
    (gameType: "rated" | "casual", timeControlMinutes: number, incrementSeconds: number) => {
      socketRef.current?.emit("lobby:join_queue", {
        gameType,
        timeControlMinutes,
        incrementSeconds,
      });
    },
    []
  );

  const leaveQueueSocket = useCallback(() => {
    socketRef.current?.emit("lobby:leave_queue");
  }, []);

  const joinSpectator = useCallback((gameId: string) => {
    socketRef.current?.emit("spectator:join", { gameId });
  }, []);

  const leaveSpectator = useCallback((gameId: string) => {
    socketRef.current?.emit("spectator:leave", { gameId });
  }, []);

  return {
    socket: socketRef.current,
    joinGame,
    makeMove,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
    joinQueue,
    leaveQueue: leaveQueueSocket,
    joinSpectator,
    leaveSpectator,
  };
}
