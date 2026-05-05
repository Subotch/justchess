"use client";

/**
 * /game/[id] — Active game page
 */

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/use-socket";
import { useGameStore } from "@/stores/game-store";
import { useSession } from "@/lib/auth-client";
import { ChessBoard } from "@/components/game/chess-board";
import { PlayerCard } from "@/components/game/player-card";
import { GameControls } from "@/components/game/game-controls";
import { MoveList } from "@/components/game/move-list";
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

  useEffect(() => {
    // Don't redirect while session is still loading
    if (isPending) {
      return;
    }
    
    if (!session?.user) {
      router.push("/auth/sign-in");
      return;
    }
    
    joinGame(gameId);
    // NOTE: `game` intentionally excluded — including it would cause an infinite
    // loop: game:started → setGame → effect re-runs → joinGame → game:started …
  }, [gameId, session?.user?.id, isPending]);

  if (isPending || !game) {
    return <LoadingSpinner fullscreen />;
  }

  const isFlipped = myColor === "black";
  const topPlayer = isFlipped ? game.white : game.black;
  const bottomPlayer = isFlipped ? game.black : game.white;

  const topPlayerState = {
    ...topPlayer,
    isActive: game.currentTurn === topPlayer.color,
  };
  const bottomPlayerState = {
    ...bottomPlayer,
    isActive: game.currentTurn === bottomPlayer.color,
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
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
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400 capitalize">{game.gameType}</span>
                <span className="text-slate-400">
                  {game.timeControlMinutes}+{game.incrementSeconds}
                </span>
              </div>
              {game.isAiGame && (
                <p className="text-slate-500 text-xs mt-1">
                  vs AI Level {game.aiDifficulty}
                </p>
              )}
              {game.spectatorCount > 0 && (
                <p className="text-slate-500 text-xs mt-1">
                  👁 {game.spectatorCount} watching
                </p>
              )}
            </div>

            {/* Controls */}
            {game.status === "active" && <GameControls gameId={gameId} />}

            {/* Game over result */}
            {game.status === "completed" && (
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-lg font-bold text-white mb-1">
                  {game.result === "white_wins"
                    ? "White wins"
                    : game.result === "black_wins"
                    ? "Black wins"
                    : "Draw"}
                </p>
                {game.resultReason && (
                  <p className="text-slate-400 text-sm capitalize">
                    by {game.resultReason.replace(/_/g, " ")}
                  </p>
                )}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => router.push("/play")}
                    className="flex-1 py-2 bg-green-500 hover:bg-green-400 rounded-lg text-sm font-semibold transition-colors"
                  >
                    New Game
                  </button>
                  <button
                    onClick={() => router.push(`/game/${gameId}/review`)}
                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Review
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
