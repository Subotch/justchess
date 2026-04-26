"use client";

import { useState } from "react";
import { useUserStore } from "@/stores/user-store";

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const { preferences, updatePreferences, resetPreferences } = useUserStore();

  return (
    <div className="fixed top-4 left-4 z-50">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="rounded-full border border-slate-700 bg-slate-800/95 px-4 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-slate-700"
        >
          ⚙ Settings
        </button>

        {open && (
          <div className="absolute left-0 mt-2 w-80 rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold text-white">Settings</h3>

            <div className="space-y-4 text-sm text-slate-200">
              <label className="flex items-center justify-between gap-4">
                <span>Show coordinates</span>
                <input
                  type="checkbox"
                  checked={preferences.showCoordinates}
                  onChange={(e) => updatePreferences({ showCoordinates: e.target.checked })}
                />
              </label>

              <label className="flex items-center justify-between gap-4">
                <span>Show legal moves</span>
                <input
                  type="checkbox"
                  checked={preferences.showLegalMoves}
                  onChange={(e) => updatePreferences({ showLegalMoves: e.target.checked })}
                />
              </label>

              <label className="flex items-center justify-between gap-4">
                <span>Auto promote to queen</span>
                <input
                  type="checkbox"
                  checked={preferences.autoPromoteToQueen}
                  onChange={(e) => updatePreferences({ autoPromoteToQueen: e.target.checked })}
                />
              </label>

              <label className="block">
                <span className="mb-1 block">Animation speed</span>
                <select
                  value={preferences.animationSpeed}
                  onChange={(e) =>
                    updatePreferences({
                      animationSpeed: e.target.value as "none" | "fast" | "normal" | "slow",
                    })
                  }
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white"
                >
                  <option value="none">None</option>
                  <option value="fast">Fast</option>
                  <option value="normal">Normal</option>
                  <option value="slow">Slow</option>
                </select>
              </label>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-white transition-colors hover:bg-slate-600"
              >
                Close
              </button>
              <button
                type="button"
                onClick={resetPreferences}
                className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-white transition-colors hover:bg-red-600"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
