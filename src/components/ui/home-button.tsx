"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function HomeButton() {
  const { t } = useTranslation();

  return (
    <Link
      href="/"
      suppressHydrationWarning
      className="flex items-center justify-center rounded-full border border-slate-700 bg-slate-800/95 px-4 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-slate-700 dark:border-slate-600 dark:bg-slate-700/95 dark:hover:bg-slate-600"
      aria-label={t('nav.home')}
      title={t('nav.home')}
    >
      <Home className="h-5 w-5 sm:mr-2" />
      <span className="hidden sm:inline" suppressHydrationWarning>JUSTCHESS</span>
    </Link>
  );
}
