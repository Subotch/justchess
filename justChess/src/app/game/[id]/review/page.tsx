"use client";

/**
 * /game/[id]/review — PGN replay / game review page
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { ChessBoard } from "@/components/game/chess-board";
import { MoveList } from "@/components/game/move-list";
import { parsePgnPositions } from "@/lib/chess-engine";

interface ReviewPageProps {
  params: Promise<{ id: string }>;
}

interface Position {
  fen: string;
  san: string;
  moveNumber: number;
  color: "white" | "black";
}

export default function ReviewPage({ params }: ReviewPageProps) {
  const { t } = useTranslation();
  const { id: gameId } = use(params);
  const router = useRouter();
  const [positions, setPositions] = useState<Position[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1); // -1 = starting position
  const [pgn, setPgn] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  useEffect(() => {
    async function loadGame() {
      try {
        const res = await fetch(`/api/games/${gameId}`);
        const data = await res.json();
        if (!data.success) {
          setError(t('common.error'));
          return;
        }
        if (data.data.pgn) {
          setPgn(data.data.pgn);
          const parsed = parsePgnPositions(data.data.pgn);
          setPositions(parsed);
          setCurrentIndex(parsed.length - 1);
        }
      } catch {
        setError(t('common.error'));
      } finally {
        setLoading(false);
      }
    }
    loadGame();
  }, [gameId, t]);

  const currentFen =
    currentIndex === -1
      ? INITIAL_FEN
      : positions[currentIndex]?.fen ?? INITIAL_FEN;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      setCurrentIndex((i) => Math.max(-1, i - 1));
    } else if (e.key === "ArrowRight") {
      setCurrentIndex((i) => Math.min(positions.length - 1, i + 1));
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [positions.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400" suppressHydrationWarning>{t('common.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-slate-700 rounded-lg text-white"
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  // Convert positions to ChessMove format for MoveList
  const moves = positions.map((p, i) => ({
    san: p.san,
    uci: "",
    fen: p.fen,
    moveNumber: p.moveNumber,
    color: p.color,
  }));

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.back()}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <span suppressHydrationWarning>← {t('common.back')}</span>
          </button>
          <h1 className="text-xl font-bold" suppressHydrationWarning>{t('game.analysis')}</h1>
          <a
            href={`/api/games/${gameId}/pgn`}
            download
            className="ml-auto text-sm text-slate-400 hover:text-white transition-colors"
          >
            <span suppressHydrationWarning>{t('common.download')}</span>
          </a>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
          {/* Board */}
          <div className="w-full max-w-[600px]">
            <ChessBoard
              gameId={gameId}
              readOnly={true}
              fen={currentFen}
            />

            {/* Navigation controls */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setCurrentIndex(-1)}
                disabled={currentIndex === -1}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-sm transition-colors"
              >
                ⏮
              </button>
              <button
                onClick={() => setCurrentIndex((i) => Math.max(-1, i - 1))}
                disabled={currentIndex === -1}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-sm transition-colors"
              >
                ◀
              </button>
              <span className="text-slate-400 text-sm min-w-[80px] text-center" suppressHydrationWarning>
                {currentIndex === -1
                  ? t('game.waitingForOpponent')
                  : `${t('common.next')} ${currentIndex + 1} / ${positions.length}`}
              </span>
              <button
                onClick={() =>
                  setCurrentIndex((i) => Math.min(positions.length - 1, i + 1))
                }
                disabled={currentIndex === positions.length - 1}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-sm transition-colors"
              >
                ▶
              </button>
              <button
                onClick={() => setCurrentIndex(positions.length - 1)}
                disabled={currentIndex === positions.length - 1}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-sm transition-colors"
              >
                ⏭
              </button>
            </div>
            <p className="text-center text-slate-500 text-xs mt-2">
              Use ← → arrow keys to navigate
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
