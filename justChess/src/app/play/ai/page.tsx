"use client";

/**
 * /play/ai — Play against AI page
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AI_DIFFICULTY_LEVELS } from "@/types/game";
import type { PieceColor } from "@/types/game";

const TIME_CONTROLS = [
  { label: "5+0", minutes: 5, increment: 0 },
  { label: "10+0", minutes: 10, increment: 0 },
  { label: "15+10", minutes: 15, increment: 10 },
  { label: "30+0", minutes: 30, increment: 0 },
];

export default function PlayAiPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [difficulty, setDifficulty] = useState(5);
  const [color, setColor] = useState<PieceColor | "random">("random");
  const [timeControl, setTimeControl] = useState(TIME_CONTROLS[1]);
  const [loading, setLoading] = useState(false);

  const selectedLevel = AI_DIFFICULTY_LEVELS.find((l) => l.level === difficulty)!;

  const handleStart = async () => {
    if (!session?.user) {
      router.push("/auth/sign-in");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: "ai",
          timeControlMinutes: timeControl.minutes,
          incrementSeconds: timeControl.increment,
          isAiGame: true,
          aiDifficulty: difficulty,
          playerColor: color,
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/game/${data.data.gameId}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="text-slate-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold">Play vs Computer</h1>
        </div>

        {/* Difficulty selector */}
        <div className="bg-slate-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Difficulty</h2>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-green-400 font-bold text-lg">
                Level {difficulty} — {selectedLevel.name}
              </span>
              <span className="text-slate-400 text-sm">~{selectedLevel.elo} ELO</span>
            </div>
            <p className="text-slate-400 text-sm mb-4">{selectedLevel.description}</p>

            <input
              type="range"
              min={1}
              max={20}
              value={difficulty}
              onChange={(e) => setDifficulty(parseInt(e.target.value))}
              className="w-full accent-green-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Beginner</span>
              <span>Maximum</span>
            </div>
          </div>

          {/* Quick level buttons */}
          <div className="grid grid-cols-5 gap-2">
            {[1, 5, 10, 15, 20].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setDifficulty(lvl)}
                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                  difficulty === lvl
                    ? "bg-green-500 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Color selection */}
        <div className="bg-slate-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Play as</h2>
          <div className="flex gap-3">
            {(["white", "random", "black"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`flex-1 py-3 rounded-lg font-medium capitalize transition-colors ${
                  color === c
                    ? "bg-green-500 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {c === "white" ? "♔ White" : c === "black" ? "♚ Black" : "🎲 Random"}
              </button>
            ))}
          </div>
        </div>

        {/* Time control */}
        <div className="bg-slate-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Time Control</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TIME_CONTROLS.map((tc) => (
              <button
                key={tc.label}
                onClick={() => setTimeControl(tc)}
                className={`py-3 rounded-lg text-sm font-medium transition-colors ${
                  timeControl.label === tc.label
                    ? "bg-green-500 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {tc.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full py-4 bg-green-500 hover:bg-green-400 disabled:bg-green-800 disabled:cursor-not-allowed rounded-xl font-bold text-lg transition-colors"
        >
          {loading ? "Starting..." : `Play vs ${selectedLevel.name}`}
        </button>
      </div>
    </div>
  );
}
