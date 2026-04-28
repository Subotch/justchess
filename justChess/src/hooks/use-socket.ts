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
import { useSession } from "@/lib/auth-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/types/socket";
import type { PieceColor } from "@/types/game";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: AppSocket | null = null;

function getSocket(): AppSocket {
  if (!socketInstance) {
    socketInstance = io(process.env.NEXT_PUBLIC_APP_URL || window.location.origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: true,
    }) as AppSocket;
  }
  return socketInstance;
}

export function useSocket() {
  const socketRef = useRef<AppSocket | null>(null);
  const { data: session } = useSession();
  const {
    setGame,
    setMyColor,
    applyMove,
    updateClocks,
    setGameEnded,
    setDrawOffered,
    clearDrawOffer,
    setOpponentDisconnected,
    setOpponentReconnected,
    setSpectatorCount,
  } = useGameStore();
  const { leaveQueue, updateQueuePosition, setPendingChallenge, clearPendingChallenge } = useLobbyStore();

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    if (!socket.connected) {
      socket.connect();
    }

    // ── Game events ──────────────────────────────────────────────────
    socket.on("game:started", ({ game }) => {
      const wasAlreadySet = !!useGameStore.getState().game;
      setGame(game);
      // Determine my color based on game structure
      // For AI games: if aiColor is "black", human is white; if aiColor is "white", human is black
      // For human vs human: check white/black player IDs against current user
      let myColor: PieceColor = "white";
      
      if (game.isAiGame) {
        myColor = (game.aiColor as PieceColor) === "black" ? "white" : "black";
      } else if (session?.user?.id) {
        // For human vs human, compare player IDs with current session user
        if (game.white.id === session.user.id) {
          myColor = "white";
        } else if (game.black.id === session.user.id) {
          myColor = "black";
        } else {
          // Spectator case - default to white (shouldn't happen for player)
          myColor = "white";
        }
      }
      
      setMyColor(myColor);
      // Only notify on the first game:started, not on reconnect re-emissions
      if (!wasAlreadySet) {
        notify.info("Game started!", `Playing as ${myColor}`);
      }
    });

    socket.on("game:move_made", (data) => {
      applyMove(data.move, data.fen, data.pgn, data.currentTurn);
    });

    socket.on("game:clock_update", (data) => {
      updateClocks(data.whiteTimeRemainingMs, data.blackTimeRemainingMs);
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
      // Navigate to the game page
      window.location.href = `/game/${data.gameId}`;
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

    socket.on("lobby:challenge_accepted", (data) => {
      clearPendingChallenge();
      notify.success("Challenge accepted", "Starting game...");
      // Redirect to game page
      window.location.href = `/game/${data.gameId}`;
    });

    socket.on("lobby:challenge_declined", (data) => {
      clearPendingChallenge();
      notify.info("Challenge declined", "Your friend declined the challenge");
    });

    socket.on("social:friend_online", (data) => {
      notify.info("Friend online", `${data.username} is now online`);
      // Trigger a refresh of friends list - can be handled by component
      window.dispatchEvent(new CustomEvent("friend-status-change", { detail: { userId: data.userId, isOnline: true } }));
    });

    socket.on("social:friend_offline", (data) => {
      notify.info("Friend offline", `${data.username} went offline`);
      window.dispatchEvent(new CustomEvent("friend-status-change", { detail: { userId: data.userId, isOnline: false } }));
    });

    // ── Error events ─────────────────────────────────────────────────
    socket.on("error:invalid_move", (data) => {
      notify.error("Invalid move", data.reason);
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
      socket.off("lobby:challenge_accepted");
      socket.off("lobby:challenge_declined");
      socket.off("social:friend_online");
      socket.off("social:friend_offline");
      socket.off("error:invalid_move");
      socket.off("error:generic");
    };
  }, []);

  const joinGame = useCallback((gameId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    const doJoin = () => socket.emit("game:join", { gameId });
    if (socket.connected) {
      doJoin();
    } else {
      // Socket may not be connected yet (e.g. after a full page reload).
      // Wait for the connect event so the emit is not silently dropped.
      socket.once("connect", doJoin);
    }
  }, []);

  const makeMove = useCallback(
    (gameId: string, from: string, to: string, promotion?: "q" | "r" | "b" | "n") => {
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

  const challengeFriend = useCallback(
    (friendId: string, timeControlMinutes: number, incrementSeconds: number) => {
      socketRef.current?.emit("lobby:challenge_friend", {
        friendId,
        timeControlMinutes,
        incrementSeconds,
      });
    },
    []
  );

  const acceptChallenge = useCallback((challengeId: string) => {
    socketRef.current?.emit("lobby:accept_challenge", { challengeId });
  }, []);

  const declineChallenge = useCallback((challengeId: string) => {
    socketRef.current?.emit("lobby:decline_challenge", { challengeId });
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
    challengeFriend,
    acceptChallenge,
    declineChallenge,
    joinSpectator,
    leaveSpectator,
  };
}
