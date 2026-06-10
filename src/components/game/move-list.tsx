"use client";

/**
 * MoveList — Lichess-style move list
 * Clean, compact, table-like layout with auto-scroll to current move.
 */

import { useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import type { ChessMove } from "@/types/game";

interface MoveListProps {
  moves: ChessMove[];
  currentMoveIndex?: number;
  onMoveClick?: (index: number) => void;
}

export function MoveList({ moves, currentMoveIndex, onMoveClick }: MoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const { t } = useTranslation();

  // Group moves into pairs (white + black)
  const movePairs: Array<{ number: number; white?: ChessMove; black?: ChessMove }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  // Scroll the highlighted move into view
  useEffect(() => {
    if (currentMoveIndex !== undefined && currentRef.current) {
      currentRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentMoveIndex]);

  if (moves.length === 0) {
    return (
      <div className="bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-center text-slate-400 dark:text-slate-500 text-xs" suppressHydrationWarning>
        {t('game.noMoves')}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="bg-slate-50 dark:bg-slate-800 rounded-xl overflow-y-auto"
      style={{ maxHeight: "320px" }}
    >
      <table className="w-full text-sm">
        <tbody>
          {movePairs.map((pair) => {
            const whiteIdx = (pair.number - 1) * 2;
            const blackIdx = whiteIdx + 1;
            const isWhiteActive = currentMoveIndex === whiteIdx;
            const isBlackActive = currentMoveIndex === blackIdx;

            return (
              <tr key={pair.number} className="group">
                {/* Move number */}
                <td className="w-8 text-slate-500 text-xs text-right pr-2 py-px align-top">
                  {pair.number}.
                </td>

                {/* White move */}
                <td className="py-px">
                  {pair.white ? (
                    <button
                      ref={isWhiteActive ? currentRef : undefined}
                      onClick={() => onMoveClick?.(whiteIdx)}
className={`w-full text-left px-2 py-0.5 text-xs rounded-sm transition-colors ${
                        isWhiteActive
                          ? "bg-green-600 text-white font-semibold"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      {pair.white.san}
                    </button>
                  ) : (
                    <div className="px-2 py-0.5 text-xs text-slate-600">&nbsp;</div>
                  )}
                </td>

                {/* Black move */}
                <td className="py-px">
                  {pair.black ? (
                    <button
                      ref={isBlackActive ? currentRef : undefined}
                      onClick={() => onMoveClick?.(blackIdx)}
className={`w-full text-left px-2 py-0.5 text-xs rounded-sm transition-colors ${
                        isBlackActive
                          ? "bg-green-600 text-white font-semibold"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      {pair.black.san}
                    </button>
                  ) : (
                    <div className="px-2 py-0.5 text-xs text-slate-600">&nbsp;</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
