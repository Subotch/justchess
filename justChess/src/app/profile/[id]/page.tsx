"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";
import { notify } from "@/stores/notification-store";
import type { ApiResponse, UserProfileResponse } from "@/types/api";

type ProfilePageProps = {
  params: Promise<{ id: string }>;
};

type AchievementItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  iconUrl: string | null;
  points: number;
  isSecret: boolean;
  earned: boolean;
  earnedAt: string | null;
  gameId: string | null;
};

type AchievementsData = {
  achievements: AchievementItem[];
  totalPoints: number;
  earnedCount: number;
  totalCount: number;
};

type ActiveTab = "games" | "achievements";

export default function ProfilePage({ params }: ProfilePageProps) {
  const { id: userId } = use(params);
  const { data: session, isPending } = useSession();
  const { t, locale } = useTranslation();

  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("games");
  const [achievements, setAchievements] = useState<AchievementsData | null>(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);

  const isOwnProfile = session?.user?.id === userId;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/users/${userId}/profile`, {
          credentials: "include",
        });
        const data: ApiResponse<UserProfileResponse> = await response.json();
        if (cancelled) return;
        if (!response.ok || !data.success) {
          setError(
            response.status === 404
              ? t("profile.notFound")
              : data.success
                ? t("profile.loadError")
                : data.error.message,
          );
          setProfile(null);
          return;
        }
        setProfile(data.data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("profile.loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, t]);

  const loadAchievements = async () => {
    if (achievements || achievementsLoading) return;
    setAchievementsLoading(true);
    try {
      const res = await fetch(`/api/achievements/user/${userId}`, {
        credentials: "include",
      });
      const data: ApiResponse<AchievementsData> = await res.json();
      if (res.ok && data.success) {
        setAchievements(data.data);
      }
    } catch {
      // silently fail
    } finally {
      setAchievementsLoading(false);
    }
  };

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === "achievements") {
      loadAchievements();
    }
  };

  const handleAddFriend = async () => {
    if (!profile) return;
    setAddingFriend(true);
    try {
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ friendCode: profile.friendCode }),
      });
      const data: ApiResponse<{ friendshipId: string; status: string }> =
        await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.success ? "" : data.error.message);
      }
      notify.success(t("profile.friendRequestSent"));
      setProfile((prev) =>
        prev ? { ...prev, friendshipStatus: "pending" } : prev,
      );
    } catch (err) {
      notify.error(
        t("common.error"),
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setAddingFriend(false);
    }
  };

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [locale],
  );

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

  if (isPending || loading) {
    return (
      <main className="min-h-screen bg-slate-900 px-4 py-10 text-white">
        <div className="mx-auto max-w-5xl" suppressHydrationWarning>
          {t("common.loading")}
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen bg-slate-900 px-4 py-10 text-white">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
          <p className="text-slate-300">{error ?? t("profile.notFound")}</p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-lg bg-green-500 px-4 py-2 font-medium text-white hover:bg-green-400"
          >
            <span suppressHydrationWarning>{t("nav.home")}</span>
          </Link>
        </div>
      </main>
    );
  }

  const initials = (profile.name || profile.username || "U")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const stats = profile.stats;
  const winRate =
    stats && stats.gamesPlayed > 0
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
      : 0;

  const playTimeHours = stats
    ? (stats.totalPlayTimeMinutes / 60).toFixed(1)
    : "0";

  const gameTypeLabel = (game: { isAiGame: boolean; gameType: string }) => {
    if (game.isAiGame) return t("profile.gameTypeAi");
    switch (game.gameType) {
      case "rated":
        return t("profile.gameTypeRated");
      case "casual":
        return t("profile.gameTypeCasual");
      case "friendly":
        return t("profile.gameTypeFriendly");
      case "tournament":
        return t("profile.gameTypeTournament");
      case "ai":
        return t("profile.gameTypeAi");
      default:
        return game.gameType;
    }
  };

  const categoryLabel = (cat: string) => {
    switch (cat) {
      case "gameplay": return locale === "ru" ? "Игровые" : "Gameplay";
      case "social": return locale === "ru" ? "Социальные" : "Social";
      case "milestone": return locale === "ru" ? "Достижения" : "Milestones";
      case "special": return locale === "ru" ? "Особые" : "Special";
      default: return cat;
    }
  };

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "gameplay": return "bg-blue-900/40 text-blue-300 border-blue-700";
      case "social": return "bg-purple-900/40 text-purple-300 border-purple-700";
      case "milestone": return "bg-yellow-900/40 text-yellow-300 border-yellow-700";
      case "special": return "bg-red-900/40 text-red-300 border-red-700";
      default: return "bg-slate-700 text-slate-300 border-slate-600";
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-10 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold" suppressHydrationWarning>
            {t("profile.title")}
          </h1>
          <Link
            href="/"
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
          >
            <span suppressHydrationWarning>{t("nav.home")}</span>
          </Link>
        </div>

        {/* Header card */}
        <section className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-green-500 text-3xl font-bold">
              {profile.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.image}
                  alt={profile.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </div>

            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold">{profile.name}</h2>
                {profile.username && (
                  <span className="text-slate-400">@{profile.username}</span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    profile.isOnline
                      ? "bg-green-900/40 text-green-400"
                      : "bg-slate-700 text-slate-300"
                  }`}
                  suppressHydrationWarning
                >
                  {profile.isOnline ? t("profile.online") : t("profile.offline")}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-400">
                <span suppressHydrationWarning>
                  {t("profile.memberSince")}:{" "}
                  <span className="text-slate-200">
                    {dateFormatter.format(new Date(profile.createdAt))}
                  </span>
                </span>
                {!profile.isOnline && profile.lastSeenAt && (
                  <span suppressHydrationWarning>
                    {t("profile.lastSeen")}:{" "}
                    <span className="text-slate-200">
                      {dateTimeFormatter.format(new Date(profile.lastSeenAt))}
                    </span>
                  </span>
                )}
                {profile.country && (
                  <span suppressHydrationWarning>
                    {t("profile.country")}:{" "}
                    <span className="text-slate-200">{profile.country}</span>
                  </span>
                )}
              </div>

              {isOwnProfile && (
                <p className="mt-3 text-sm">
                  <span
                    className="text-slate-400"
                    suppressHydrationWarning
                  >
                    {t("profile.friendCode")}:{" "}
                  </span>
                  <span className="font-mono tracking-[0.25em] text-green-400">
                    {profile.friendCode}
                  </span>
                </p>
              )}

              <p className="mt-3 text-sm text-slate-300">
                {profile.bio || (
                  <span className="italic text-slate-500" suppressHydrationWarning>
                    {t("profile.noBio")}
                  </span>
                )}
              </p>
            </div>

            {!isOwnProfile && session?.user && (
              <div className="flex flex-col gap-2">
                {profile.isFriend ? (
                  <span
                    className="rounded-lg bg-slate-700 px-4 py-2 text-center text-sm font-medium text-slate-200"
                    suppressHydrationWarning
                  >
                    {t("profile.alreadyFriends")}
                  </span>
                ) : profile.friendshipStatus === "pending" ? (
                  <span
                    className="rounded-lg bg-slate-700 px-4 py-2 text-center text-sm font-medium text-slate-200"
                    suppressHydrationWarning
                  >
                    {t("profile.pendingRequest")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddFriend}
                    disabled={addingFriend}
                    className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-slate-600"
                  >
                    <span suppressHydrationWarning>
                      {addingFriend
                        ? t("common.loading")
                        : t("profile.addFriend")}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Ratings */}
        {stats && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <RatingCard
              label={t("profile.ratingRapid")}
              value={stats.ratingRapid}
            />
            <RatingCard
              label={t("profile.ratingBlitz")}
              value={stats.ratingBlitz}
            />
            <RatingCard
              label={t("profile.ratingBullet")}
              value={stats.ratingBullet}
            />
            <RatingCard
              label={t("profile.ratingClassical")}
              value={stats.ratingClassical}
            />
          </section>
        )}

        {/* Stats */}
        {stats && (
          <section className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
            <h2
              className="mb-4 text-xl font-semibold"
              suppressHydrationWarning
            >
              {t("profile.stats")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatItem
                label={t("profile.gamesPlayed")}
                value={stats.gamesPlayed}
              />
              <StatItem
                label={t("profile.wins")}
                value={stats.gamesWon}
                color="text-green-400"
              />
              <StatItem
                label={t("profile.losses")}
                value={stats.gamesLost}
                color="text-red-400"
              />
              <StatItem
                label={t("profile.draws")}
                value={stats.gamesDrawn}
                color="text-yellow-400"
              />
              <StatItem
                label={t("profile.winRate")}
                value={`${winRate}%`}
              />
              <StatItem
                label={t("profile.winStreak")}
                value={stats.currentWinStreak}
              />
              <StatItem
                label={t("profile.bestStreak")}
                value={stats.bestWinStreak}
              />
              <StatItem
                label={t("profile.playTimeHours")}
                value={`${playTimeHours}h`}
                color="text-blue-400"
              />
            </div>
          </section>
        )}

        {/* Switchable: Recent Games / Achievements */}
        <section className="rounded-2xl border border-slate-700 bg-slate-800 shadow-sm">
          {/* Tab bar */}
          <div className="flex border-b border-slate-700">
            <button
              type="button"
              onClick={() => handleTabChange("games")}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                activeTab === "games"
                  ? "border-b-2 border-green-400 text-green-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              suppressHydrationWarning
            >
              {t("profile.recentGamesTab")}
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("achievements")}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                activeTab === "achievements"
                  ? "border-b-2 border-green-400 text-green-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              suppressHydrationWarning
            >
              {t("profile.achievementsTab")}
            </button>
          </div>

          <div className="p-6">
            {/* Recent Games tab */}
            {activeTab === "games" && (
              <>
                {profile.recentGames.length === 0 ? (
                  <p className="text-sm text-slate-400" suppressHydrationWarning>
                    {t("profile.noRecentGames")}
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-slate-700">
                    {profile.recentGames.map((game) => {
                      const isWin =
                        (game.result === "white_wins" && game.color === "white") ||
                        (game.result === "black_wins" && game.color === "black");
                      const isLoss =
                        (game.result === "white_wins" && game.color === "black") ||
                        (game.result === "black_wins" && game.color === "white");
                      const resultLabel = isWin
                        ? t("profile.win")
                        : isLoss
                          ? t("profile.loss")
                          : t("profile.draw");
                      const resultColor = isWin
                        ? "text-green-400"
                        : isLoss
                          ? "text-red-400"
                          : "text-yellow-400";

                      return (
                        <li
                          key={game.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`min-w-[72px] rounded-md bg-slate-900 px-2 py-1 text-center text-sm font-semibold ${resultColor}`}
                              suppressHydrationWarning
                            >
                              {resultLabel}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-white">
                                {game.isAiGame ? (
                                  <span suppressHydrationWarning>
                                    {t("profile.vsAI")}
                                    {game.aiDifficulty
                                      ? ` (lvl ${game.aiDifficulty})`
                                      : ""}
                                  </span>
                                ) : game.opponent ? (
                                  <Link
                                    href={`/profile/${game.opponent.id}`}
                                    className="transition-colors hover:text-green-400 hover:underline"
                                  >
                                    {game.opponent.name}
                                  </Link>
                                ) : (
                                  "—"
                                )}
                              </p>
                              <p className="text-xs text-slate-400">
                                <span suppressHydrationWarning>
                                  {gameTypeLabel(game)}
                                </span>
                                {" · "}
                                {game.timingCategory} · {game.timeControlMinutes}+
                                {game.incrementSeconds} · {game.totalMoves} moves
                                {game.endedAt && (
                                  <>
                                    {" · "}
                                    {dateTimeFormatter.format(new Date(game.endedAt))}
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                          <Link
                            href={`/game/${game.id}/review`}
                            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600"
                          >
                            <span suppressHydrationWarning>
                              {t("profile.viewGame")}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {/* Show all games button */}
                <div className="mt-4 flex justify-center">
                  <Link
                    href={`/profile/${userId}/games`}
                    className="rounded-lg bg-slate-700 px-5 py-2 text-sm font-medium text-white hover:bg-slate-600"
                  >
                    <span suppressHydrationWarning>{t("profile.showAllGames")}</span>
                  </Link>
                </div>
              </>
            )}

            {/* Achievements tab */}
            {activeTab === "achievements" && (
              <>
                {achievementsLoading ? (
                  <p className="text-sm text-slate-400" suppressHydrationWarning>
                    {t("common.loading")}
                  </p>
                ) : achievements ? (
                  <>
                    {/* Summary */}
                    <div className="mb-6 flex flex-wrap items-center gap-4">
                      <div className="rounded-xl border border-slate-700 bg-slate-900/40 px-5 py-3">
                        <p className="text-xs uppercase tracking-wider text-slate-400" suppressHydrationWarning>
                          {t("profile.earnedAchievements")
                            .replace("{{earned}}", String(achievements.earnedCount))
                            .replace("{{total}}", String(achievements.totalCount))}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-700 bg-slate-900/40 px-5 py-3">
                        <p className="text-xs uppercase tracking-wider text-slate-400" suppressHydrationWarning>
                          {t("profile.totalPoints")}:{" "}
                          <span className="text-yellow-400 font-bold">{achievements.totalPoints}</span>
                        </p>
                      </div>
                    </div>

                    {achievements.achievements.length === 0 ? (
                      <p className="text-sm text-slate-400" suppressHydrationWarning>
                        {t("profile.noAchievements")}
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {achievements.achievements.map((ach) => {
                          const isSecret = ach.isSecret && !ach.earned;
                          return (
                            <div
                              key={ach.id}
                              className={`group relative flex items-start gap-4 rounded-xl border p-4 transition-all duration-200 ${
                                ach.earned
                                  ? "border-yellow-500/40 bg-gradient-to-br from-slate-800 to-slate-900 shadow-md shadow-yellow-500/5"
                                  : "border-slate-700/60 bg-slate-900/30"
                              }`}
                            >
                              {/* Earned glow */}
                              {ach.earned && (
                                <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-yellow-500/5 to-transparent" />
                              )}

                              {/* Icon */}
                              <div
                                className={`relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-2xl transition-all ${
                                  ach.earned
                                    ? "bg-yellow-500/20 ring-2 ring-yellow-500/40"
                                    : "bg-slate-700/50 grayscale"
                                }`}
                              >
                                {isSecret ? "🔒" : ach.earned ? "🏆" : "🔓"}
                              </div>

                              <div className="min-w-0 flex-1">
                                {/* Title + category */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className={`text-sm font-bold leading-tight ${ach.earned ? "text-white" : "text-slate-500"}`}>
                                    {isSecret ? "???" : ach.name}
                                  </p>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                      ach.earned
                                        ? categoryColor(ach.category)
                                        : "border-slate-700 bg-slate-800/40 text-slate-600"
                                    }`}
                                  >
                                    {categoryLabel(ach.category)}
                                  </span>
                                </div>

                                {/* Description */}
                                <p className={`mt-1 text-xs leading-relaxed ${ach.earned ? "text-slate-300" : "text-slate-600"}`}>
                                  {isSecret
                                    ? (locale === "ru" ? "Секретное достижение" : "Secret achievement")
                                    : ach.description}
                                </p>

                                {/* Footer */}
                                <div className="mt-2 flex items-center gap-3">
                                  <span className={`text-xs font-semibold ${ach.earned ? "text-yellow-400" : "text-slate-700"}`}>
                                    {ach.earned ? "+" : ""}{ach.points} pts
                                  </span>
                                  {ach.earned && ach.earnedAt ? (
                                    <span className="text-xs text-green-400">
                                      ✓ {dateTimeFormatter.format(new Date(ach.earnedAt))}
                                    </span>
                                  ) : !ach.earned ? (
                                    <span className="text-xs text-slate-700" suppressHydrationWarning>
                                      {locale === "ru" ? "Не получено" : "Locked"}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400" suppressHydrationWarning>
                    {t("profile.noAchievements")}
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function RatingCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4 shadow-sm">
      <p
        className="text-xs uppercase tracking-wider text-slate-400"
        suppressHydrationWarning
      >
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-green-400">{value}</p>
    </div>
  );
}

function StatItem({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
      <p
        className="text-xs uppercase tracking-wider text-slate-400"
        suppressHydrationWarning
      >
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
