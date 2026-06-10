/**
 * Home page — landing / lobby
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";

export default function HomePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handlePlayClick = () => {
    if (!session?.user) {
      setShowAuthModal(true);
    } else {
      router.push("/play");
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 px-4 py-10 text-slate-900 dark:from-slate-800 dark:to-slate-900 dark:text-white">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl" suppressHydrationWarning>
          {t('home.title')}
        </h1>
        <p className="mb-8 text-xl text-slate-500 dark:text-slate-400 sm:text-2xl" suppressHydrationWarning>
          {t('home.subtitle')}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <button
            onClick={handlePlayClick}
            className="inline-flex items-center justify-center rounded-xl bg-green-500 px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-green-400 hover:shadow-lg hover:shadow-green-500/25"
          >
            <span suppressHydrationWarning>{t('home.cta')}</span>
          </button>
        </div>
      </div>

{/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2" suppressHydrationWarning>
              {t('auth.signIn')}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6" suppressHydrationWarning>{t('auth.signInToPlay')}</p>

            <div className="space-y-3">
              <Link
                href="/auth/sign-in"
                className="w-full py-3 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-lg transition-colors text-center"
              >
                <span suppressHydrationWarning>{t('auth.signIn')}</span>
              </Link>
              <Link
                href="/auth/sign-up"
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white font-semibold rounded-lg transition-colors text-center border border-slate-300 dark:border-slate-600"
              >
                <span suppressHydrationWarning>{t('auth.signUp')}</span>
              </Link>
            </div>

            <button
              onClick={() => setShowAuthModal(false)}
              className="mt-4 w-full py-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors text-sm"
            >
              <span suppressHydrationWarning>{t('common.cancel')}</span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
