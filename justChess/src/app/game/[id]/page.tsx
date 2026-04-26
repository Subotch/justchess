"use client";

/**
 * /game/[id] — Active game page
 */

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/use-socket";
import { useGameStore } from "@/stores/game-store";
import { ChessBoard } from "@/components/game/chess-board";
import { GameControls } from "@/components/game/game-controls";
import { PlayerCard } from "@/components/game/player-card";
import { MoveList } from "@/components/game/move-list";

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = use(params);
  const router = useRouter();
  const { joinGame } = useSocket();
  const { game, myColor } = useGameStore();

  useEffect(() => {
    if (gameId) {
      joinGame(gameId);
    }
  }, [gameId, joinGame]);

  // Redirect when game ends
  useEffect(() => {
    if (game?.status === "completed" || game?.status === "abandoned") {
      // Stay on page to show result, redirect after delay
      const timer = setTimeout(() => {
        router.push(`/game/${gameId}/review`);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [game?.status, gameId, router]);

  if (!game) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading game...</div>
      </div>
    );
  }

  const isFlipped = myColor === "black";
  const topPlayer = isFlipped ? game.white : game.black;
  const bottomPlayer = isFlipped ? game.black : game.white;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
          {/* Board area */}
          <div className="flex flex-col gap-3 w-full max-w-[600px]">
            <PlayerCard player={topPlayer} isTop />
            <ChessBoard gameId={gameId} />
            <PlayerCard player={bottomPlayer} isTop={false} />
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4 w-full lg:w-72">
            <GameControls gameId={gameId} />
            <MoveList moves={game.moves} />
          </div>
        </div>
      </div>
    </div>
  );
}
