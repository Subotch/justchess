"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useLobbyStore } from "@/stores/lobby-store";

export function HomeButton() {
  const { t } = useTranslation();
  const isInQueue = useLobbyStore((s) => s.queue.isInQueue);

  return (
    <Link
      href="/"
      suppressHydrationWarning
      onClick={isInQueue ? (e) => e.preventDefault() : undefined}
      aria-disabled={isInQueue}
      tabIndex={isInQueue ? -1 : 0}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 dark:text-white transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-green-600 dark:hover:text-green-400 ${isInQueue ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}
      aria-label={t('nav.home')}
      title={t('nav.home')}
    >
      <Home className="h-5 w-5 flex-shrink-0" />
      <span className="hidden xs:inline font-bold tracking-wide">JUSTCHESS</span>
    </Link>
  );
}
