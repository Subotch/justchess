/**
 * ReviewBoard — клиентский компонент навигации по партии.
 * Получает pgn и позиции, управляет индексом через state.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { ChessBoard } from "@/components/game/chess-board";
import { MoveList } from "@/components/game/move-list";
import { parsePgnPositions } from "@/lib/chess-engine";

interface Position {
  fen: string;
  san: string;
  moveNumber: number;
  color: "white" | "black";
}

interface ReviewBoardProps {
  gameId: string;
  pgn: string;
}

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function ReviewBoard({ gameId, pgn }: ReviewBoardProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const positions: Position[] = pgn ? parsePgnPositions(pgn) : [];
  const [currentIndex, setCurrentIndex] = useState(positions.length - 1);

  const currentFen =
    currentIndex === -1
      ? INITIAL_FEN
      : positions[currentIndex]?.fen ?? INITIAL_FEN;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setCurrentIndex((i) => Math.max(-1, i - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((i) => Math.min(positions.length - 1, i + 1));
      }
    },
    [positions.length]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const moves = positions.map((p) => ({
    san: p.san,
    uci: "",
    fen: p.fen,
    moveNumber: p.moveNumber,
    color: p.color,
  }));

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.back()}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <span suppressHydrationWarning>← {t("common.back")}</span>
          </button>
          <h1 className="text-xl font-bold" suppressHydrationWarning>
            {t("game.analysis")}
          </h1>
          <a
            href={`/api/games/${gameId}/pgn`}
            download
            className="ml-auto text-sm text-slate-400 hover:text-white transition-colors"
          >
            <span suppressHydrationWarning>{t("common.download")}</span>
          </a>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
          {/* Board */}
          <div className="w-full max-w-[600px]">
            <ChessBoard gameId={gameId} readOnly={true} fen={currentFen} />

            {/* Navigation controls */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setCurrentIndex(-1)}
                disabled={currentIndex === -1}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-40 rounded-lg text-sm transition-colors text-slate-700 dark:text-white"
              >
                <span suppressHydrationWarning>{t('game.goToStart')}</span>
              </button>
              <button
                onClick={() => setCurrentIndex((i) => Math.max(-1, i - 1))}
                disabled={currentIndex === -1}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-40 rounded-lg text-sm transition-colors text-slate-700 dark:text-white"
              >
                ◀
              </button>
              <span
                className="text-slate-400 text-sm min-w-[100px] text-center"
                suppressHydrationWarning
              >
                {currentIndex === -1
                  ? t("game.startingPosition")
                  : `${t("game.moveOf", { current: currentIndex + 1, total: positions.length })}`}
              </span>
              <button
                onClick={() =>
                  setCurrentIndex((i) => Math.min(positions.length - 1, i + 1))
                }
                disabled={currentIndex === positions.length - 1}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-40 rounded-lg text-sm transition-colors text-slate-700 dark:text-white"
              >
                ▶
              </button>
              <button
                onClick={() => setCurrentIndex(positions.length - 1)}
                disabled={currentIndex === positions.length - 1}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-40 rounded-lg text-sm transition-colors text-slate-700 dark:text-white"
              >
                <span suppressHydrationWarning>{t('game.goToEnd')}</span>
              </button>
            </div>
            <p className="text-center text-slate-500 text-xs mt-2" suppressHydrationWarning>
              {t("game.arrowKeysHint")}
            </p>
          </div>

          {/* Move list */}
          <div className="w-full lg:w-72">
            <MoveList
              moves={moves}
              currentMoveIndex={currentIndex}
              onMoveClick={(idx) => setCurrentIndex(idx)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
