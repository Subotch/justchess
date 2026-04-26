/**
 * Home page — landing / lobby
 */

import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { games } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 pt-20">
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 tracking-tight">
          Just Chess
        </h1>
        <p className="text-xl text-slate-400 mb-8 max-w-xl">
          Play chess online with friends, compete in rated matches, or challenge AI opponents.
        </p>

        <div className="flex flex-wrap gap-4 justify-center">
          {session?.user ? (
            <>
              <Link
                href="/play"
                className="px-8 py-3 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-lg transition-colors text-lg"
              >
                Play Now
              </Link>
              <Link
                href="/play/ai"
                className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors text-lg"
              >
                vs Computer
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth/sign-up"
                className="px-8 py-3 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-lg transition-colors text-lg"
              >
                Get Started
              </Link>
              <Link
                href="/auth/sign-in"
                className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors text-lg"
              >
                Sign In
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            icon: "♟",
            title: "Rated Matches",
            desc: "Compete in bullet, blitz, rapid, and classical time controls with ELO rating.",
          },
          {
            icon: "🤖",
            title: "AI Opponents",
            desc: "Challenge Stockfish at 20+ difficulty levels from beginner to grandmaster.",
          },
          {
            icon: "👁",
            title: "Watch Live",
            desc: "Spectate ongoing games in real-time and learn from top players.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center"
          >
            <div className="text-4xl mb-3">{f.icon}</div>
            <h3 className="text-white font-semibold text-lg mb-2">{f.title}</h3>
            <p className="text-slate-400 text-sm">{f.desc}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
