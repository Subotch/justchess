"use client";

/**
 * GameControls — resign, draw offer, chat buttons
 */

import { useState } from "react";
import { useGameStore } from "@/stores/game-store";
import { useSocket } from "@/hooks/use-socket";

interface GameControlsProps {
  gameId: string;
}

export function GameControls({ gameId }: GameControlsProps) {
  const { game, myColor, drawOfferedByOpponent, drawOfferedByMe } = useGameStore();
  const { resign, offerDraw, acceptDraw, declineDraw } = useSocket();
  const [showResignConfirm, setShowResignConfirm] = useState(false);

  const isActive = game?.status === "active";
  const isMyTurn = game?.currentTurn === myColor;

  if (!isActive || game?.result !== "in_progress") {
    return (
      <div className="bg-slate-800 rounded-xl p-4 text-center">
        <p className="text-slate-400 text-sm">Game over</p>
        {game?.result && (
          <p className="text-white font-bold mt-1 capitalize">
            {game.result === "white_wins" ? "White wins" : game.result === "black_wins" ? "Black wins" : "Draw"}
          </p>
        )}
        {game?.resultReason && (
          <p className="text-slate-500 text-xs mt-1 capitalize">
            {game.resultReason.replace(/_/g, " ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
      {/* Draw offer from opponent */}
      {drawOfferedByOpponent && (
        <div className="bg-blue-900/50 border border-blue-700 rounded-lg p-3 text-center">
          <p className="text-blue-300 text-sm mb-2">Opponent offers a draw</p>
          <div className="flex gap-2">
            <button
              onClick={() => acceptDraw(gameId)}
              className="flex-1 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm font-semibold transition-colors"
            >
              Accept
            </button>
            <button
              onClick={() => declineDraw(gameId)}
              className="flex-1 py-1.5 bg-red-700 hover:bg-red-600 rounded text-sm font-semibold transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {!drawOfferedByMe && !drawOfferedByOpponent && (
          <button
            onClick={() => offerDraw(gameId)}
            className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
          >
            ½ Draw
          </button>
        )}
        {drawOfferedByMe && (
          <div className="flex-1 py-2 bg-slate-700 rounded-lg text-sm text-center text-slate-400">
            Draw offered...
          </div>
        )}

        {!showResignConfirm ? (
          <button
            onClick={() => setShowResignConfirm(true)}
            className="flex-1 py-2 bg-red-900/50 hover:bg-red-800/50 border border-red-800 rounded-lg text-sm font-medium text-red-400 transition-colors"
          >
            Resign
          </button>
        ) : (
          <div className="flex-1 flex gap-1">
            <button
              onClick={() => {
                resign(gameId);
                setShowResignConfirm(false);
              }}
              className="flex-1 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-semibold transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowResignConfirm(false)}
              className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Turn indicator */}
      <div className={`text-center text-sm py-1 rounded ${isMyTurn ? "text-green-400" : "text-slate-400"}`}>
        {isMyTurn ? "Your turn" : "Opponent's turn"}
      </div>
    </div>
  );
}
