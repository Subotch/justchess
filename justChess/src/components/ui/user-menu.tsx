"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";

export function UserMenu() {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

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
    <div className="fixed top-4 right-4 z-50">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
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
          <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-700 bg-slate-800 p-3 shadow-2xl">
            <div className="mb-3 border-b border-slate-700 pb-3">
              <p className="truncate text-sm font-semibold text-white">
                {session.user.name || "User"}
              </p>
              <p className="truncate text-xs text-slate-400">{session.user.email}</p>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={loading}
              className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900"
            >
              {loading ? "Signing out..." : "Sign out"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
