"use client";

/**
 * /game/[id] — Active game page
 */

import { useEffect, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSocket, getSocket } from "@/hooks/use-socket";
import { useGameStore } from "@/stores/game-store";
import { useSession } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";
import { ChessBoard } from "@/components/game/chess-board";
import { GameControls } from "@/components/game/game-controls";
import { MoveList } from "@/components/game/move-list";
import { PlayerCard } from "@/components/game/player-card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface GamePageProps {
  params: Promise<{ id: string }>;
}

export default function GamePage({ params }: GamePageProps) {
const { id: gameId } = use(params);
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { joinGame } = useSocket();
  const { game, myColor } = useGameStore();
  const { t } = useTranslation();

  // Stable ref to track whether we already attempted to join
  const joinedRef = useRef(false);

  useEffect(() => {
    // Don't redirect while session is still loading
    if (isPending) return;

    if (!session?.user) {
      router.push("/auth/sign-in");
      return;
    }
    
    // Guard: only join once per mount (avoid double-join on React StrictMode double-render)
    if (joinedRef.current) return;
    joinedRef.current = true;

    joinGame(gameId);

    // Safety timeout — redirect only after confirming the socket is connected
    // but no game:started arrived within 10s. We do NOT redirect if socket is
    // still connecting, otherwise slow/busy connections would break gameplay.
    const timeout = setTimeout(() => {
      const socket = getSocket();
      if (socket.connected && !useGameStore.getState().game) {
        router.replace("/play");
      }
    }, 10_000);

    return () => clearTimeout(timeout);
  }, [gameId, session?.user?.id, isPending, joinGame, router]);

  if (isPending || !game) {
    return <LoadingSpinner fullscreen />;
  }

  const isFlipped = myColor === "black";
  const topPlayer = isFlipped ? game.white : game.black;
  const bottomPlayer = isFlipped ? game.black : game.white;

  const gameOver = game.status !== "active";
  const topPlayerState = {
    ...topPlayer,
    isActive: !gameOver && game.currentTurn === topPlayer.color,
  };
  const bottomPlayerState = {
    ...bottomPlayer,
    isActive: !gameOver && game.currentTurn === bottomPlayer.color,
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">
      <div className="max-w-7xl mx-auto px-4 pt-24 sm:pt-6 pb-6">
        <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
          {/* Board column */}
          <div className="w-full max-w-[600px] flex flex-col gap-3">
            {/* Top player */}
            <PlayerCard player={topPlayerState} isTop={true} fen={game.fen} />

            {/* Chess board */}
            <ChessBoard gameId={gameId} />

            {/* Bottom player */}
            <PlayerCard player={bottomPlayerState} isTop={false} fen={game.fen} />
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-72 flex flex-col gap-4">
            {/* Game info */}
<div className="bg-white dark:bg-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400 capitalize" suppressHydrationWarning>{t(`play.${game.gameType}`)}</span>
                <span className="text-slate-500 dark:text-slate-400" suppressHydrationWarning>
                  {game.timeControlMinutes}+{game.incrementSeconds}
                </span>
              </div>
              {game.isAiGame && (
                <p className="text-slate-500 text-xs mt-1" suppressHydrationWarning>
                  {t('play.vsAI')} — {t('play.difficulty')} {game.aiDifficulty}
                </p>
              )}
              {game.spectatorCount > 0 && (
                <p className="text-slate-500 text-xs mt-1" suppressHydrationWarning>
                  {t('game.watching')} {game.spectatorCount}
                </p>
              )}
            </div>

            {/* Controls */}
            {game.status === "active" && <GameControls gameId={gameId} />}

            {/* Game over result */}
            {game.status === "completed" && (
              <div
                className={`rounded-2xl p-6 text-center border-2 ${
                  game.result === "draw"
                    ? "bg-gradient-to-br from-slate-700 to-slate-800 border-slate-500"
                    : game.result === (myColor === "white" ? "white_wins" : "black_wins")
                    ? "bg-gradient-to-br from-green-900 to-emerald-800 border-green-500"
                    : "bg-gradient-to-br from-red-900 to-rose-800 border-red-500"
                }`}
              >
                <p className="text-3xl font-black text-white mb-1" suppressHydrationWarning>
                  {game.result === "white_wins"
                    ? t('game.whiteWins')
                    : game.result === "black_wins"
                    ? t('game.blackWins')
                    : t('game.draw')}
                </p>
                {game.resultReason && (
                  <p className="text-sm text-white/70 capitalize mb-4" suppressHydrationWarning>
                    {t(`game.${game.resultReason}`) || game.resultReason.replace(/_/g, " ")}
                  </p>
                )}
                {game.result !== "draw" && (
                  <p className="text-sm font-semibold text-white/80 mb-4" suppressHydrationWarning>
                    {game.result === (myColor === "white" ? "white_wins" : "black_wins")
                      ? t('game.youWin')
                      : t('game.youLose')}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push("/play")}
                    className="flex-1 py-3 bg-green-500 hover:bg-green-400 rounded-xl text-sm font-bold text-white transition-colors shadow-lg"
                  >
                    <span suppressHydrationWarning>{t('game.newGame')}</span>
                  </button>
                  <button
                    onClick={() => router.push(`/game/${gameId}/review`)}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-semibold text-white transition-colors border border-white/20"
                  >
                    <span suppressHydrationWarning>{t('game.review')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Move list */}
            <MoveList moves={game.moves} />
          </div>
        </div>
      </div>
    </div>
  );
}
