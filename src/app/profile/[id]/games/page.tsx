"use client";

import { useEffect, useMemo, useState, use, useCallback } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import type { ApiResponse } from "@/types/api";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

type ProfileGamesPageProps = {
  params: Promise<{ id: string }>;
};

type GameItem = {
  id: string;
  opponent: { id: string; username: string; name: string | null; image: string | null } | null;
  color: "white" | "black";
  result: string | null;
  resultReason: string | null;
  gameType: string;
  timingCategory: string | null;
  timeControlMinutes: number;
  incrementSeconds: number;
  totalMoves: number | null;
  isAiGame: boolean;
  aiDifficulty: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

type GamesResponse = {
  items: GameItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

const PAGE_SIZE = 20;

export default function ProfileGamesPage({ params }: ProfileGamesPageProps) {
  const { id: userId } = use(params);
  const { t, locale } = useTranslation();

  const [items, setItems] = useState<GameItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filters
  const [opponentQuery, setOpponentQuery] = useState("");
  const [debouncedOpponent, setDebouncedOpponent] = useState("");
  const [gameType, setGameType] = useState("");
  const [timingCategory, setTimingCategory] = useState("");
  const [sortBy, setSortBy] = useState("endedAt");
  const [sortDir, setSortDir] = useState("desc");

  // Debounce opponent input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedOpponent(opponentQuery), 400);
    return () => clearTimeout(timer);
  }, [opponentQuery]);

  const fetchGames = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const qp = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
        sortBy,
        sortDir,
      });
      if (gameType) qp.set("gameType", gameType);
      if (timingCategory) qp.set("timingCategory", timingCategory);
      if (debouncedOpponent) qp.set("opponent", debouncedOpponent);

      const res = await fetch(`/api/users/${userId}/games?${qp}`, { credentials: "include" });
      const data: ApiResponse<GamesResponse> = await res.json();
      if (res.ok && data.success) {
        setItems(data.data.items);
        setTotal(data.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, sortBy, sortDir, gameType, timingCategory, debouncedOpponent]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
    fetchGames(1);
  }, [sortBy, sortDir, gameType, timingCategory, debouncedOpponent]);

  useEffect(() => {
    fetchGames(page);
  }, [page]);

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getResultLabel = (game: GameItem) => {
    const isWin =
      (game.result === "white_wins" && game.color === "white") ||
      (game.result === "black_wins" && game.color === "black");
    const isLoss =
      (game.result === "white_wins" && game.color === "black") ||
      (game.result === "black_wins" && game.color === "white");
    if (isWin) return { label: t("profile.win"), color: "text-green-400" };
    if (isLoss) return { label: t("profile.loss"), color: "text-red-400" };
    return { label: t("profile.draw"), color: "text-yellow-400" };
  };

  const getGameTypeLabel = (gt: string) => {
    const map: Record<string, string> = {
      rated: t("profile.gameTypeRated"),
      casual: t("profile.gameTypeCasual"),
      friendly: t("profile.gameTypeFriendly"),
      ai: t("profile.gameTypeAi"),
    };
    return map[gt] ?? gt;
  };

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 px-4 py-10 text-slate-900 dark:text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold" suppressHydrationWarning>
            {t("gamesHistory.title")}
          </h1>
          <Link
            href={`/profile/${userId}`}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
          >
            <span suppressHydrationWarning>{t("gamesHistory.backToProfile")}</span>
          </Link>
        </div>

        {/* Filters */}
<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* Opponent search */}
            <div className="xl:col-span-2">
              <input
                type="text"
                value={opponentQuery}
                onChange={(e) => setOpponentQuery(e.target.value)}
                placeholder={t("gamesHistory.searchOpponent")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-green-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
              />
            </div>

            {/* Game type */}
            <select
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="" suppressHydrationWarning>{t("gamesHistory.allTypes")}</option>
              <option value="rated" suppressHydrationWarning>{t("profile.gameTypeRated")}</option>
              <option value="casual" suppressHydrationWarning>{t("profile.gameTypeCasual")}</option>
              <option value="friendly" suppressHydrationWarning>{t("profile.gameTypeFriendly")}</option>
              <option value="ai" suppressHydrationWarning>{t("profile.gameTypeAi")}</option>
            </select>

            {/* Timing category */}
            <select
              value={timingCategory}
              onChange={(e) => setTimingCategory(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="" suppressHydrationWarning>{t("gamesHistory.allTimings")}</option>
              <option value="bullet">Bullet</option>
              <option value="blitz">Blitz</option>
              <option value="rapid">Rapid</option>
              <option value="classical">Classical</option>
            </select>

            {/* Sort by */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="endedAt" suppressHydrationWarning>{t("gamesHistory.sortDate")}</option>
              <option value="result" suppressHydrationWarning>{t("gamesHistory.sortResult")}</option>
            </select>

            {/* Sort dir */}
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="desc" suppressHydrationWarning>{t("gamesHistory.sortDesc")}</option>
              <option value="asc" suppressHydrationWarning>{t("gamesHistory.sortAsc")}</option>
            </select>
          </div>
        </div>

        {/* Table */}
<div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {loading ? (
            <LoadingSpinner />
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400" suppressHydrationWarning>
              {t("gamesHistory.noGames")}
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {items.map((game) => {
                const { label: resultLabel, color: resultColor } = getResultLabel(game);
                const opponentName =
                  game.isAiGame
                    ? t("profile.vsAI")
                    : (game.opponent?.name || game.opponent?.username) ?? "?";

                return (
                  <li
                    key={game.id}
                    className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/40"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      {/* Result badge */}
                      <span className={`w-16 shrink-0 text-sm font-bold ${resultColor}`} suppressHydrationWarning>
                        {resultLabel}
                      </span>

                      {/* Opponent */}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {game.opponent && !game.isAiGame ? (
                            <Link
                              href={`/profile/${game.opponent.id}`}
                              className="hover:underline"
                            >
                              {opponentName}
                            </Link>
                          ) : (
                            opponentName
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          <span suppressHydrationWarning>{getGameTypeLabel(game.gameType)}</span>
                          {" · "}
                          {game.timingCategory}
                          {" · "}
                          {game.timeControlMinutes}+{game.incrementSeconds}
                          {game.totalMoves != null && <> · {game.totalMoves} moves</>}
                          {game.endedAt && (
                            <> · {dateTimeFormatter.format(new Date(game.endedAt))}</>
                          )}
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/game/${game.id}/review`}
                      className="shrink-0 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
                    >
                      <span suppressHydrationWarning>{t("profile.viewGame")}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              <p className="text-sm text-slate-500 dark:text-slate-400" suppressHydrationWarning>
                {t("gamesHistory.page")} {page} {t("gamesHistory.of")} {totalPages} · {total} total
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
                  suppressHydrationWarning
                >
                  {t("gamesHistory.prev")}
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
                  suppressHydrationWarning
                >
                  {t("gamesHistory.next")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
