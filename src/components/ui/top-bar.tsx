"use client";

/**
 * TopBar — единый navbar для кнопок JUSTCHESS, Настройки, Профиль.
 * Решена проблема наслоения: всё в одном flex-контейнере,
 * dropdown-элементы имеют свой z-index через absolute-обёртки.
 */

import { HomeButton } from "./home-button";
import { SettingsPanel } from "./settings-panel";
import { UserMenu } from "./user-menu";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { useLobbyStore } from "@/stores/lobby-store";

export function TopBar() {
  const { t } = useTranslation();
  const isInQueue = useLobbyStore((s) => s.queue.isInQueue);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-3 sm:px-6 py-3 bg-white/95 dark:bg-slate-800 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-lg">
      {/* Left: JUSTCHESS + Таблица лидеров */}
      <div className="flex items-center gap-2 sm:gap-3">
        <HomeButton />
        <Link
          href="/leaderboard"
          aria-disabled={isInQueue}
          tabIndex={isInQueue ? -1 : 0}
          onClick={isInQueue ? (e) => e.preventDefault() : undefined}
          className={`hidden sm:flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/95 px-3 py-2 text-sm font-medium text-slate-800 dark:text-white shadow transition-colors hover:bg-slate-100 dark:hover:bg-slate-600 hover:text-green-600 dark:hover:text-green-400 ${isInQueue ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}
        >
          {t("leaderboard.title")}
        </Link>
        <SettingsPanel />
      </div>

      {/* Right: Профиль */}
      <UserMenu isInQueue={isInQueue} />
    </header>
  );
}
