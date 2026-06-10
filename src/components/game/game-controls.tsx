"use client";

/**
 * GameControls — resign, draw offer, chat buttons
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/stores/game-store";
import { useSocket } from "@/hooks/use-socket";
import { useTranslation } from "@/lib/i18n";

interface GameControlsProps {
  gameId: string;
}

export function GameControls({ gameId }: GameControlsProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { game, myColor, drawOfferedByOpponent, drawOfferedByMe } = useGameStore();
  const { resign, offerDraw, acceptDraw, declineDraw } = useSocket();
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  const isActive = game?.status === "active";
  const isMyTurn = game?.currentTurn === myColor;

  if (!isActive || game?.result !== "in_progress") {
    return (
<div className="bg-white dark:bg-slate-800 rounded-xl p-4 text-center">
        <p className="text-slate-500 dark:text-slate-400 text-sm" suppressHydrationWarning>{t('game.gameOver')}</p>
        {game?.result && (
          <p className="text-slate-900 dark:text-white font-bold mt-1 capitalize">
            {game.result === "white_wins"
              ? t('game.whiteWins')
              : game.result === "black_wins"
              ? t('game.blackWins')
              : t('game.draw')}
          </p>
        )}
        {game?.resultReason && (
          <p className="text-slate-500 text-xs mt-1 capitalize">
            {t(`game.${game.resultReason}`) || game.resultReason.replace(/_/g, " ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
      {/* Draw offer from opponent */}
      {drawOfferedByOpponent && (
        <div className="bg-blue-900/50 border border-blue-700 rounded-lg p-3 text-center">
          <p className="text-blue-300 text-sm mb-2" suppressHydrationWarning>{t('game.drawOfferedByOpponent')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => acceptDraw(gameId)}
              className="flex-1 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm font-semibold transition-colors"
            >
              <span suppressHydrationWarning>{t('game.acceptDraw')}</span>
            </button>
            <button
              onClick={() => declineDraw(gameId)}
              className="flex-1 py-1.5 bg-red-700 hover:bg-red-600 rounded text-sm font-semibold transition-colors"
            >
              <span suppressHydrationWarning>{t('game.declineDraw')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {!drawOfferedByMe && !drawOfferedByOpponent && (
          <button
            onClick={() => offerDraw(gameId)}
            className="flex-1 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-white transition-colors"
          >
            <span suppressHydrationWarning>{t('game.offerDraw')}</span>
          </button>
        )}
        {drawOfferedByMe && (
          <div className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm text-center text-slate-500 dark:text-slate-400">
            <span suppressHydrationWarning>{t('game.drawOfferPending')}</span>
          </div>
        )}

        {!showResignConfirm ? (
          <button
            onClick={() => setShowResignConfirm(true)}
            className="flex-1 py-2 bg-red-900/50 hover:bg-red-800/50 border border-red-800 rounded-lg text-sm font-medium text-red-400 transition-colors"
          >
            <span suppressHydrationWarning>{t('game.resign')}</span>
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
              <span suppressHydrationWarning>{t('game.confirmResign')}</span>
            </button>
<button
              onClick={() => setShowResignConfirm(false)}
              className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm text-slate-700 dark:text-white transition-colors"
            >
              <span suppressHydrationWarning>{t('game.cancelAction')}</span>
            </button>
          </div>
        )}
      </div>

      {!showBackConfirm ? (
        <button
          onClick={() => setShowBackConfirm(true)}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/70 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-600"
        >
          <span suppressHydrationWarning>{t('common.back')}</span>
        </button>
      ) : (
<div className="rounded-lg border border-amber-500 bg-amber-50 dark:bg-amber-900/40 p-3">
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-200" suppressHydrationWarning>
            {t('game.backConfirmMessage')}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                resign(gameId);
                router.push("/play");
              }}
              className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-500"
            >
              <span suppressHydrationWarning>{t('game.confirmLeave')}</span>
            </button>
<button
              onClick={() => setShowBackConfirm(false)}
              className="flex-1 rounded-lg bg-slate-200 dark:bg-slate-700 py-2 text-sm text-slate-700 dark:text-white transition-colors hover:bg-slate-300 dark:hover:bg-slate-600"
            >
              <span suppressHydrationWarning>{t('common.cancel')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Turn indicator */}
      <div className={`text-center text-sm py-1 rounded ${isMyTurn ? "text-green-400" : "text-slate-400"}`} suppressHydrationWarning>
        {isMyTurn ? t('game.yourTurn') : t('game.opponentTurn')}
      </div>
    </div>
  );
}
