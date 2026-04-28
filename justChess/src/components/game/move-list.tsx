"use client";

/**
 * MoveList — scrollable list of moves in algebraic notation
 */

import { useRef, useEffect } from "react";
import type { ChessMove } from "@/types/game";

interface MoveListProps {
  moves: ChessMove[];
  currentMoveIndex?: number;
  onMoveClick?: (index: number) => void;
}

export function MoveList({ moves, currentMoveIndex, onMoveClick }: MoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest move — scroll only inside the container
  useEffect(() => {
    if (currentMoveIndex === undefined && containerRef.current && bottomRef.current) {
      const container = containerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [moves.length, currentMoveIndex]);

  // Group moves into pairs (white + black)
  const movePairs: Array<{ number: number; white?: ChessMove; black?: ChessMove }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  if (moves.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 text-center text-slate-500 text-sm">
        No moves yet
      </div>
    );
  }

  return (
    <div ref={containerRef} className="bg-slate-800 rounded-xl p-3 max-h-80 overflow-y-auto">
      <div className="space-y-0.5">
        {movePairs.map((pair) => {
          const whiteIdx = (pair.number - 1) * 2;
          const blackIdx = whiteIdx + 1;

          return (
            <div key={pair.number} className="flex items-center gap-1 text-sm">
              {/* Move number */}
              <span className="text-slate-500 w-7 text-right flex-shrink-0">
                {pair.number}.
              </span>

              {/* White move */}
              <button
                onClick={() => onMoveClick?.(whiteIdx)}
                className={`flex-1 text-left px-2 py-0.5 rounded transition-colors ${
                  currentMoveIndex === whiteIdx
                    ? "bg-slate-600 text-white"
                    : "text-slate-300 hover:bg-slate-700"
                }`}
              >
                {pair.white?.san ?? ""}
              </button>

              {/* Black move */}
              {pair.black ? (
                <button
                  onClick={() => onMoveClick?.(blackIdx)}
                  className={`flex-1 text-left px-2 py-0.5 rounded transition-colors ${
                    currentMoveIndex === blackIdx
                      ? "bg-slate-600 text-white"
                      : "text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {pair.black.san}
                </button>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
