"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";

export function UserMenu() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  if (!session?.user) {
    return null;
  }

  const initials = (session.user.name || session.user.email || "U")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50" ref={containerRef}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          suppressHydrationWarning
          className="flex items-center gap-3 rounded-full border border-slate-700 bg-slate-800/95 px-3 py-2 text-white shadow-lg transition-colors hover:bg-slate-700"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500 font-bold text-white">
            {initials}
          </div>
          <div className="hidden text-left sm:block">
            <div className="max-w-[160px] truncate text-sm font-semibold">
              {session.user.name || "User"}
            </div>
            <div className="max-w-[160px] truncate text-xs text-slate-400">
              {session.user.email}
            </div>
          </div>
        </button>

        {open && (
          <div
            className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-700 bg-slate-800 p-3 shadow-2xl"
            suppressHydrationWarning
          >
            <div className="mb-3 border-b border-slate-700 pb-3">
              <p className="truncate text-sm font-semibold text-white">
                {session.user.name || "User"}
              </p>
              <p className="truncate text-xs text-slate-400">{session.user.email}</p>
            </div>

            <div className="mb-3 flex flex-col gap-2">
              <Link
                href={`/profile/${session.user.id}`}
                onClick={() => setOpen(false)}
                className="w-full rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-600"
              >
                <span suppressHydrationWarning>{t('nav.profile')}</span>
              </Link>
              <Link
                href="/friends"
                onClick={() => setOpen(false)}
                className="w-full rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-600"
              >
                <span suppressHydrationWarning>{t('nav.friends')}</span>
              </Link>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={loading}
              className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900"
            >
              <span suppressHydrationWarning>{loading ? t('common.loading') : t('nav.signOut')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
