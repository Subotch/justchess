/**
 * useLobbyStore — matchmaking queue and lobby state
 */

"use client";

import { create } from "zustand";
import type { LiveGame, TimingCategory } from "@/types/game";

interface QueueState {
  isInQueue: boolean;
  gameType: "rated" | "casual" | null;
  timeControlMinutes: number | null;
  incrementSeconds: number | null;
  joinedAt: number | null;
  position: number;
  estimatedWaitSeconds: number;
}

interface LobbyStore {
  queue: QueueState;
  liveGames: LiveGame[];
  pendingChallenge: {
    challengeId: string;
    from: { id: string; username: string; rating: number };
    timeControlMinutes: number;
    incrementSeconds: number;
    expiresAt: string;
  } | null;

  // Actions
  joinQueue: (gameType: "rated" | "casual", timeControlMinutes: number, incrementSeconds: number) => void;
  leaveQueue: () => void;
  updateQueuePosition: (position: number, estimatedWaitSeconds: number) => void;
  setLiveGames: (games: LiveGame[]) => void;
  setPendingChallenge: (challenge: LobbyStore["pendingChallenge"]) => void;
  clearPendingChallenge: () => void;
  acceptPendingChallenge: () => { challengeId: string } | null;
  declinePendingChallenge: () => void;
}

const initialQueue: QueueState = {
  isInQueue: false,
  gameType: null,
  timeControlMinutes: null,
  incrementSeconds: null,
  joinedAt: null,
  position: 0,
  estimatedWaitSeconds: 0,
};

export const useLobbyStore = create<LobbyStore>((set) => ({
  queue: initialQueue,
  liveGames: [],
  pendingChallenge: null,

  joinQueue: (gameType, timeControlMinutes, incrementSeconds) =>
    set({
      queue: {
        isInQueue: true,
        gameType,
        timeControlMinutes,
        incrementSeconds,
        joinedAt: Date.now(),
        position: 0,
        estimatedWaitSeconds: 30,
      },
    }),

  leaveQueue: () => set({ queue: initialQueue }),

  updateQueuePosition: (position, estimatedWaitSeconds) =>
    set((state) => ({
      queue: { ...state.queue, position, estimatedWaitSeconds },
    })),

  setLiveGames: (games) => set({ liveGames: games }),

  setPendingChallenge: (challenge) => set({ pendingChallenge: challenge }),

  clearPendingChallenge: () => set({ pendingChallenge: null }),

  acceptPendingChallenge: (): { challengeId: string } | null => {
    let result: { challengeId: string } | null = null;
    useLobbyStore.setState((state) => {
      if (state.pendingChallenge) {
        result = { challengeId: state.pendingChallenge.challengeId };
      }
      return { pendingChallenge: null };
    });
    return result;
  },

  declinePendingChallenge: (): { challengeId: string } | null => {
    let result: { challengeId: string } | null = null;
    useLobbyStore.setState((state) => {
      if (state.pendingChallenge) {
        result = { challengeId: state.pendingChallenge.challengeId };
      }
      return { pendingChallenge: null };
    });
    return result;
  },
}));
