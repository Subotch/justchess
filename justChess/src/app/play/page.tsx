"use client";

/**
 * /play — Matchmaking lobby page
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/use-socket";
import { useLobbyStore } from "@/stores/lobby-store";
import { useTranslation } from "@/lib/i18n";

const TIME_CONTROLS = [
  { label: "Bullet 1+0", minutes: 1, increment: 0, category: "bullet" },
  { label: "Bullet 2+1", minutes: 2, increment: 1, category: "bullet" },
  { label: "Blitz 3+0", minutes: 3, increment: 0, category: "blitz" },
  { label: "Blitz 3+2", minutes: 3, increment: 2, category: "blitz" },
  { label: "Blitz 5+0", minutes: 5, increment: 0, category: "blitz" },
  { label: "Blitz 5+3", minutes: 5, increment: 3, category: "blitz" },
  { label: "Rapid 10+0", minutes: 10, increment: 0, category: "rapid" },
  { label: "Rapid 10+5", minutes: 10, increment: 5, category: "rapid" },
  { label: "Rapid 15+10", minutes: 15, increment: 10, category: "rapid" },
  { label: "Classical 30+0", minutes: 30, increment: 0, category: "classical" },
];

export default function PlayPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { joinQueue, leaveQueue } = useSocket();
  const { queue, leaveQueue: leaveQueueStore } = useLobbyStore();
  const [selectedControl, setSelectedControl] = useState(TIME_CONTROLS[6]);
  const [gameType, setGameType] = useState<"rated" | "casual">("rated");
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (queue.isInQueue && queue.joinedAt) {
      setElapsed(Math.floor((Date.now() - queue.joinedAt) / 1000));
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (queue.joinedAt ?? Date.now())) / 1000));
      }, 1000);
    } else {
      setElapsed(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [queue.isInQueue, queue.joinedAt]);

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleJoinQueue = () => {
    joinQueue(gameType, selectedControl.minutes, selectedControl.increment);
  };

  const handleLeaveQueue = () => {
    leaveQueue();
    leaveQueueStore();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8" suppressHydrationWarning>{t('play.title')}</h1>

        {/* Game Type */}
        <div className="flex gap-4 mb-6">
          {(["rated", "casual"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setGameType(type)}
              className={`flex-1 py-3 rounded-lg font-semibold capitalize transition-colors ${
                gameType === type
                  ? "bg-green-500 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              <span suppressHydrationWarning>{t(`play.${type}`)}</span>
            </button>
          ))}
        </div>

        {/* Time Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {TIME_CONTROLS.map((tc) => (
            <button
              key={tc.label}
              onClick={() => setSelectedControl(tc)}
              className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                selectedControl.label === tc.label
                  ? "bg-green-500 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              <div className="font-bold">{tc.label}</div>
              <div className="text-xs opacity-70 capitalize">{tc.category}</div>
            </button>
          ))}
        </div>

        {/* Queue Status */}
        {queue.isInQueue ? (
          <div className="bg-slate-800 rounded-xl p-6 text-center">
            {/* Spinner */}
            <div className="flex justify-center mb-4">
              <span className="inline-block w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="text-xl font-semibold mb-1" suppressHydrationWarning>
              {t('play.searching')}
            </div>
            <p className="text-slate-400 text-sm mb-1">{selectedControl.label}</p>
            {/* Live timer */}
            <p className="text-3xl font-mono font-bold text-green-400 mb-3">{formatElapsed(elapsed)}</p>
            {queue.position > 0 && (
              <p className="text-slate-500 text-sm mb-3" suppressHydrationWarning>
                {t('play.queuePosition', { position: queue.position })}
              </p>
            )}
            <button
              onClick={handleLeaveQueue}
              className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-semibold transition-colors"
            >
              <span suppressHydrationWarning>{t('play.cancelSearch')}</span>
            </button>
          </div>
        ) : (
          <button
            onClick={handleJoinQueue}
            className="w-full py-4 bg-green-500 hover:bg-green-400 rounded-xl font-bold text-lg transition-colors"
          >
            <span suppressHydrationWarning>{t('play.joinQueue')} · {t(`play.${gameType}`)}</span>
          </button>
        )}

        {/* vs AI shortcut */}
        <div className="mt-6 text-center">
          <button
            onClick={() => router.push("/play/ai")}
            className="text-slate-400 hover:text-white transition-colors text-sm"
          >
            <span suppressHydrationWarning>{t('play.vsAI')} →</span>
          </button>
        </div>
      </div>
    </div>
  );
}
