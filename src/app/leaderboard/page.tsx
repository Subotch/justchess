"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslation } from "@/lib/i18n";

type LeaderboardEntry = {
  userId: string;
  username: string | null;
  name: string;
  image: string | null;
  rating: number;
  gamesPlayed: number;
};

type CategoryLeaderboard = {
  bullet: LeaderboardEntry[];
  blitz: LeaderboardEntry[];
  rapid: LeaderboardEntry[];
  classical: LeaderboardEntry[];
  average: LeaderboardEntry[];
  total: LeaderboardEntry[];
};

type CategoryKey = keyof Omit<CategoryLeaderboard, "never">;

const CATEGORIES: { key: CategoryKey; labelKey: string }[] = [
  { key: "bullet", labelKey: "profile.ratingBullet" },
  { key: "blitz", labelKey: "profile.ratingBlitz" },
  { key: "rapid", labelKey: "profile.ratingRapid" },
  { key: "classical", labelKey: "profile.ratingClassical" },
  { key: "average", labelKey: "leaderboard.average" },
  { key: "total", labelKey: "leaderboard.total" },
];

function UserAvatar({ name, image, size = "md" }: { name: string; image: string | null; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  if (image) {
    return (
      <Image
        src={image}
        alt={name}
        width={size === "sm" ? 32 : 40}
        height={size === "sm" ? 32 : 40}
        className={`${sizeClass} rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-600`}
      />
    );
  }
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={`${sizeClass} rounded-full bg-green-500 font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-600`}>
      {initials}
    </div>
  );
}

function LeaderboardTable({
  entries,
  category,
  t,
}: {
  entries: LeaderboardEntry[];
  category: CategoryKey;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const isTotal = category === "total";
  const isAverage = category === "average";

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400">
        {t("leaderboard.noPlayers")}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400">
            <th className="px-4 py-3 text-left">#</th>
            <th className="px-4 py-3 text-left">{t("leaderboard.player")}</th>
            <th className="px-4 py-3 text-right">
              {isTotal
                ? t("leaderboard.totalRating")
                : isAverage
                ? t("leaderboard.avgRating")
                : t("leaderboard.rating")}
            </th>
            <th className="px-4 py-3 text-right hidden sm:table-cell">
              {t("leaderboard.games")}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const medalClass =
              index === 0
                ? "text-yellow-500 dark:text-yellow-400"
                : index === 1
                ? "text-slate-400 dark:text-slate-300"
                : index === 2
                ? "text-amber-600 dark:text-amber-500"
                : "text-slate-500 dark:text-slate-400";
            return (
              <tr
                key={entry.userId}
                className="border-b border-slate-200 dark:border-slate-700/50 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td className={`px-4 py-3 font-bold ${medalClass}`}>
                  {index + 1}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/profile/${entry.userId}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    <UserAvatar name={entry.name} image={entry.image} size="sm" />
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        {entry.username || entry.name}
                      </div>
                      {entry.username && entry.name !== entry.username && (
                        <div className="text-xs text-slate-400">{entry.name}</div>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-mono text-base font-bold text-green-600 dark:text-green-400">
                  {entry.rating.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-slate-400 dark:text-slate-500 hidden sm:table-cell">
                  {entry.gamesPlayed}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("bullet");
  const [data, setData] = useState<CategoryLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((json) => {
        setData(json.data);
        setLoading(false);
      })
      .catch(() => {
        setError(t("leaderboard.loadError"));
        setLoading(false);
      });
  }, [t]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 px-4 py-8 text-slate-900 dark:from-slate-800 dark:to-slate-900 dark:text-white pb-20 pt-20">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t("leaderboard.title")}
            </h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              {t("leaderboard.subtitle")}
            </p>
          </div>
          <Link
            href="/play"
            className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-400"
          >
            {t("play.joinQueue")}
          </Link>
        </div>

        {/* Category tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORIES.map(({ key, labelKey }) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeCategory === key
                  ? "bg-green-500 text-white"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {/* Category description */}
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {activeCategory === "bullet" && t("leaderboard.descBullet")}
          {activeCategory === "blitz" && t("leaderboard.descBlitz")}
          {activeCategory === "rapid" && t("leaderboard.descRapid")}
          {activeCategory === "classical" && t("leaderboard.descClassical")}
          {activeCategory === "average" && t("leaderboard.descAverage")}
          {activeCategory === "total" && t("leaderboard.descTotal")}
        </p>

        {/* Content */}
        {loading && (
          <div className="py-16 text-center text-slate-400">
            {t("common.loading")}
          </div>
        )}
        {error && (
          <div className="py-16 text-center text-red-400">{error}</div>
        )}
        {!loading && !error && data && (
          <LeaderboardTable
            entries={data[activeCategory]}
            category={activeCategory}
            t={t}
          />
        )}

        {/* Note */}
        <p className="mt-6 text-center text-xs text-slate-500">
          {t("leaderboard.note")}
        </p>
      </div>
    </main>
  );
}
