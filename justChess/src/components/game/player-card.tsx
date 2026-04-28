"use client";

/**
 * PlayerCard — shows player info and clock
 */

import { useEffect, useState } from "react";
import { formatTime, formatTimePrecise, getCapturedPieces } from "@/lib/chess-engine";
import type { GamePlayer, PieceColor } from "@/types/game";

const PIECE_SYMBOLS: Record<string, Record<PieceColor, string>> = {
  q: { white: "♛", black: "♕" },
  r: { white: "♜", black: "♖" },
  b: { white: "♝", black: "♗" },
  n: { white: "♞", black: "♘" },
  p: { white: "♟", black: "♙" },
};

interface PlayerCardProps {
  player: GamePlayer & { isActive: boolean };
  isTop: boolean;
  fen?: string;
}

export function PlayerCard({ player, isTop, fen }: PlayerCardProps) {
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

  const captured = fen ? getCapturedPieces(fen, player.color) : {};
  // opponent color for correct symbols (we captured opponent's pieces)
  const opponentColor: PieceColor = player.color === "white" ? "black" : "white";
  const capturedDisplay = (["q", "r", "b", "n", "p"] as const).flatMap((p) => {
    const count = captured[p] ?? 0;
    return Array(count).fill(PIECE_SYMBOLS[p][opponentColor]);
  });

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 rounded-lg ${
        player.isActive
          ? "bg-slate-700 border border-slate-500"
          : "bg-slate-800/50 border border-slate-700"
      }`}
    >
      {/* Player info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 flex-shrink-0 rounded-full bg-slate-600 flex items-center justify-center text-sm font-bold text-white overflow-hidden">
          {player.image ? (
            <img src={player.image} alt={player.username} className="w-full h-full object-cover" />
          ) : (
            player.username[0]?.toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">{player.username}</p>
          <p className="text-slate-400 text-xs">{player.rating}</p>
        </div>
        {capturedDisplay.length > 0 && (
          <div className="flex flex-wrap gap-0 leading-none text-base ml-1 opacity-90" title="Captured pieces">
            {capturedDisplay.map((sym, i) => (
              <span key={i}>{sym}</span>
            ))}
          </div>
        )}
      </div>

      {/* Clock */}
      <div
        className={`flex-shrink-0 font-mono font-bold text-xl px-3 py-1 rounded ${
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
