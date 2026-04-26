"use client";

/**
 * PlayerCard — shows player info and clock
 */

import { useEffect, useState } from "react";
import { formatTime, formatTimePrecise } from "@/lib/chess-engine";
import type { GamePlayer } from "@/types/game";

interface PlayerCardProps {
  player: GamePlayer & { isActive: boolean };
  isTop: boolean;
}

export function PlayerCard({ player, isTop }: PlayerCardProps) {
  const [displayMs, setDisplayMs] = useState(player.timeRemainingMs);
  const isLowTime = displayMs < 30_000;
  const isCritical = displayMs < 10_000;

  // Tick the clock locally for smooth display
  useEffect(() => {
    setDisplayMs(player.timeRemainingMs);
    if (!player.isActive || player.timeRemainingMs <= 0) return;

    const interval = setInterval(() => {
      setDisplayMs((prev: number) => Math.max(0, prev - 100));
    }, 100);

    return () => clearInterval(interval);
  }, [player.timeRemainingMs, player.isActive]);

  const timeDisplay =
    displayMs < 10_000
      ? formatTimePrecise(displayMs)
      : formatTime(displayMs);

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 rounded-lg ${
        player.isActive
          ? "bg-slate-700 border border-slate-500"
          : "bg-slate-800/50 border border-slate-700"
      }`}
    >
      {/* Player info */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-sm font-bold text-white overflow-hidden">
          {player.image ? (
            <img src={player.image} alt={player.username} className="w-full h-full object-cover" />
          ) : (
            player.username[0]?.toUpperCase()
          )}
        </div>
        <div>
          <p className="text-white font-semibold text-sm">{player.username}</p>
          <p className="text-slate-400 text-xs">{player.rating}</p>
        </div>
      </div>

      {/* Clock */}
      <div
        className={`font-mono font-bold text-xl px-3 py-1 rounded ${
          isCritical
            ? "bg-red-600 text-white animate-pulse"
            : isLowTime
            ? "bg-yellow-600/30 text-yellow-300"
            : player.isActive
            ? "bg-slate-600 text-white"
            : "bg-slate-700/50 text-slate-400"
        }`}
      >
        {timeDisplay}
      </div>
    </div>
  );
}
