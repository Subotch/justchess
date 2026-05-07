/**
 * useUserStore — user preferences and settings
 */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserPreferences } from "@/types/api";

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  boardTheme: "classic",
  pieceSet: "standard",
  soundEnabled: true,
  showCoordinates: true,
  autoPromoteToQueen: false,
  showLegalMoves: true,
  animationSpeed: "normal",
};

interface UserStore {
  preferences: UserPreferences;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      preferences: DEFAULT_PREFERENCES,

      updatePreferences: (prefs) =>
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        })),

      resetPreferences: () => set({ preferences: DEFAULT_PREFERENCES }),
    }),
    {
      name: "justchess-user-preferences",
    }
  )
);
