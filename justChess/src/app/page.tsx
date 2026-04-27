/**
 * Home page — landing / lobby
 */
"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 px-4 py-10 text-white dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl" suppressHydrationWarning>
          {t('home.title')}
        </h1>
        <p className="mb-8 text-xl text-slate-300 dark:text-slate-400 sm:text-2xl" suppressHydrationWarning>
          {t('home.subtitle')}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/play"
            className="inline-flex items-center justify-center rounded-xl bg-green-500 px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-green-400 hover:shadow-lg hover:shadow-green-500/25"
          >
            <span suppressHydrationWarning>{t('home.cta')}</span>
          </Link>
          <Link
            href="/friends"
            className="inline-flex items-center justify-center rounded-xl border border-slate-600 bg-slate-800/50 px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-slate-700 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800/30"
          >
            <span suppressHydrationWarning>{t('nav.friends')}</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
