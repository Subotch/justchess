"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";
import { User, LogOut, Trophy, Users, ChevronDown } from "lucide-react";

interface UserMenuProps {
  isInQueue?: boolean;
}

export function UserMenu({ isInQueue = false }: UserMenuProps) {
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

  const handleLinkClick = (e: React.MouseEvent) => {
    if (isInQueue) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        suppressHydrationWarning
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 dark:text-white transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-green-600 dark:hover:text-green-400"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-500 font-bold text-white text-xs">
          {initials}
        </div>
        <div className="hidden sm:block text-left">
          <div className="max-w-[140px] truncate text-sm font-semibold leading-tight">
            {session.user.name || "User"}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-2 shadow-2xl z-[60]"
          suppressHydrationWarning
        >
          {/* User info header */}
          <div className="px-3 py-2 mb-2 border-b border-slate-200 dark:border-slate-600">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {session.user.name || "User"}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {session.user.email}
            </p>
          </div>

          {/* Navigation links */}
          <nav className="space-y-1 mb-2">
            <Link
              href={`/profile/${session.user.id}`}
              onClick={handleLinkClick}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-green-600 dark:hover:text-green-400 ${isInQueue ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}
            >
              <User className="h-4 w-4 flex-shrink-0" />
              <span suppressHydrationWarning>{t('nav.profile')}</span>
            </Link>
            <Link
              href="/leaderboard"
              onClick={handleLinkClick}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-green-600 dark:hover:text-green-400 ${isInQueue ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}
            >
              <Trophy className="h-4 w-4 flex-shrink-0" />
              <span suppressHydrationWarning>{t('leaderboard.title')}</span>
            </Link>
            <Link
              href="/friends"
              onClick={handleLinkClick}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-green-600 dark:hover:text-green-400 ${isInQueue ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}
            >
              <Users className="h-4 w-4 flex-shrink-0" />
              <span suppressHydrationWarning>{t('nav.friends')}</span>
            </Link>
          </nav>

          {/* Sign out */}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={loading}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span suppressHydrationWarning>{loading ? t('common.loading') : t('nav.signOut')}</span>
          </button>
        </div>
      )}
    </div>
  );
}