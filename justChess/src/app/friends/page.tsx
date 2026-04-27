"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { useSocket } from "@/hooks/use-socket";
import { useLobbyStore } from "@/stores/lobby-store";
import { notify } from "@/stores/notification-store";
import { useTranslation } from "@/lib/i18n";
import type { ApiResponse, FriendListItem, UserProfileResponse } from "@/types/api";

export default function FriendsPage() {
  const { data: session, isPending } = useSession();
  const { t } = useTranslation();
  const { socket, challengeFriend, acceptChallenge, declineChallenge } = useSocket();
  const pendingChallenge = useLobbyStore((state: any) => state.pendingChallenge);
  const clearPendingChallenge = useLobbyStore((state: any) => state.clearPendingChallenge);

  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [myFriendCode, setMyFriendCode] = useState<string | null>(null);
  const [friendCode, setFriendCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Challenge modal state
  const [challengeModalOpen, setChallengeModalOpen] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<{ id: string; username: string } | null>(null);
  const [challengeTime, setChallengeTime] = useState(10);
  const [challengeIncrement, setChallengeIncrement] = useState(0);

  const loadFriends = useCallback(async () => {
    if (!session?.user?.id) return;

    setLoading(true);
    setError(null);

    try {
      const [friendsResponse, profileResponse] = await Promise.all([
        fetch("/api/friends", { credentials: "include" }),
        fetch(`/api/users/${session.user.id}/profile`, { credentials: "include" }),
      ]);

      const friendsData: ApiResponse<FriendListItem[]> = await friendsResponse.json();
      const profileData: ApiResponse<UserProfileResponse> = await profileResponse.json();

      if (!friendsResponse.ok || !friendsData.success) {
        throw new Error(friendsData.success ? t('friends.emptyFriends') : friendsData.error.message);
      }

      if (!profileResponse.ok || !profileData.success) {
        throw new Error(profileData.success ? t('common.error') : profileData.error.message);
      }

      setFriends(friendsData.data);
      setMyFriendCode(profileData.data.friendCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!isPending && session?.user) {
      loadFriends();
    } else if (!isPending) {
      setLoading(false);
    }
  }, [isPending, session?.user, loadFriends]);

  // Listen for friend status changes
  useEffect(() => {
    const handleFriendStatusChange = (event: CustomEvent<{ userId: string; isOnline: boolean }>) => {
      setFriends((prev) =>
        prev.map((item) =>
          item.user.id === event.detail.userId
            ? { ...item, user: { ...item.user, isOnline: event.detail.isOnline } }
            : item
        )
      );
    };

    window.addEventListener("friend-status-change", handleFriendStatusChange as EventListener);
    return () =>
      window.removeEventListener("friend-status-change", handleFriendStatusChange as EventListener);
  }, []);

  const handleAddFriend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ friendCode: friendCode.trim().toUpperCase() }),
      });

      const data: ApiResponse<{ friendshipId: string; status: string }> = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.success ? t('friends.sent') : data.error.message);
      }

      setFriendCode("");
      setMessage(t('friends.sent'));
      await loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('friends.sent'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestAction = async (friendshipId: string, action: "accept" | "reject") => {
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/friends/${friendshipId}?action=${action}`, {
        method: "PATCH",
        credentials: "include",
      });

      const data: ApiResponse<{ friendshipId: string; status: string }> = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.success ? (action === "accept" ? t('friends.accepted') : t('friends.rejected')) : data.error.message);
      }

      setMessage(action === "accept" ? t('friends.accepted') : t('friends.rejected'));
      await loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
  };

  const handleRemove = async (friendshipId: string) => {
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/friends/${friendshipId}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data: ApiResponse<{ deleted: boolean }> = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.success ? "Delete failed" : data.error.message);
      }

      setMessage(t('friends.removed'));
      await loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const openChallengeModal = (friendId: string, friendUsername: string) => {
    setSelectedFriend({ id: friendId, username: friendUsername });
    setChallengeModalOpen(true);
  };

  const sendChallenge = () => {
    if (!selectedFriend || !socket) return;

    challengeFriend(selectedFriend.id, challengeTime, challengeIncrement);
    setChallengeModalOpen(false);
    setSelectedFriend(null);
    notify.info("Challenge sent", `Waiting for ${selectedFriend.username} to accept...`);
  };

  const handleAcceptChallenge = () => {
    if (pendingChallenge && socket) {
      acceptChallenge(pendingChallenge.challengeId);
      clearPendingChallenge();
    }
  };

  const handleDeclineChallenge = () => {
    if (pendingChallenge && socket) {
      declineChallenge(pendingChallenge.challengeId);
      clearPendingChallenge();
    }
  };

  if (isPending || loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-900 dark:text-white">
        <div className="mx-auto max-w-5xl" suppressHydrationWarning>{t('common.loading')}</div>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-900 dark:text-white">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-slate-600 dark:text-slate-300">Нужно войти в аккаунт.</p>
          <Link href="/auth/sign-in" className="mt-4 inline-flex rounded-lg bg-green-500 px-4 py-2 font-medium text-white hover:bg-green-400">
            <span suppressHydrationWarning>{t('nav.signIn')}</span>
          </Link>
        </div>
      </main>
    );
  }

  const accepted = friends.filter((item) => item.status === "accepted");
  const incoming = friends.filter((item) => item.status === "pending" && item.direction === "received");
  const outgoing = friends.filter((item) => item.status === "pending" && item.direction === "sent");

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-10 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" suppressHydrationWarning>{t('friends.title')}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400" suppressHydrationWarning>{t('friends.subtitle')}</p>
          </div>
          <Link href="/" className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">
            <span suppressHydrationWarning>{t('nav.home')}</span>
          </Link>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400" suppressHydrationWarning>{t('friends.yourCode')}</p>
              <p className="mt-1 text-2xl font-bold tracking-[0.25em] text-green-500">{myFriendCode ?? "—"}</p>
            </div>

            <form onSubmit={handleAddFriend} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
              <input
                value={friendCode}
                onChange={(event) => setFriendCode(event.target.value.toUpperCase())}
                placeholder={t('friends.enterCode')}
                maxLength={8}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 outline-none transition focus:border-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
              <button
                type="submit"
                disabled={submitting || friendCode.trim().length !== 8}
                className="rounded-lg bg-green-500 px-4 py-2 font-medium text-white transition hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-slate-200"
              >
                <span suppressHydrationWarning>{submitting ? t('friends.sending') : t('friends.add')}</span>
              </button>
            </form>
          </div>

          {message && <p className="mt-3 text-sm text-green-500">{message}</p>}
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <FriendsColumn
            title={t('friends.friends')}
            items={accepted}
            emptyText={t('friends.emptyFriends')}
            action={(item) => (
              <div className="flex gap-2">
                <button
                  onClick={() => openChallengeModal(item.user.id, item.user.username || item.user.name)}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                >
                  <span suppressHydrationWarning>{t('friends.challenge')}</span>
                </button>
                <button
                  onClick={() => handleRemove(item.friendshipId)}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                >
                  <span suppressHydrationWarning>{t('friends.remove')}</span>
                </button>
              </div>
            )}
            t={t}
          />

          <FriendsColumn
            title={t('friends.incoming')}
            items={incoming}
            emptyText={t('friends.emptyIncoming')}
            action={(item) => (
              <div className="flex gap-2">
                <button
                  onClick={() => handleRequestAction(item.friendshipId, "accept")}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
                >
                  <span suppressHydrationWarning>{t('friends.accept')}</span>
                </button>
                <button
                  onClick={() => handleRequestAction(item.friendshipId, "reject")}
                  className="rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-500"
                >
                  <span suppressHydrationWarning>{t('friends.reject')}</span>
                </button>
              </div>
            )}
            t={t}
          />

          <FriendsColumn
            title={t('friends.outgoing')}
            items={outgoing}
            emptyText={t('friends.emptyOutgoing')}
            action={() => <span className="text-xs text-slate-500" suppressHydrationWarning>{t('friends.waiting')}</span>}
            t={t}
          />
        </section>
      </div>

      {/* Challenge Modal */}
      {challengeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white" suppressHydrationWarning>{t('challenge.title')}</h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400" suppressHydrationWarning>
              {selectedFriend?.username && t('challenge.playingAgainst', { username: selectedFriend.username })}
            </p>

            <div className="mb-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300" suppressHydrationWarning>
                  {t('challenge.timeMinutes', { time: challengeTime })}
                </label>
                <input
                  type="range"
                  min="1"
                  max="60"
                  step="1"
                  value={challengeTime}
                  onChange={(e) => setChallengeTime(Number(e.target.value))}
                  className="w-full accent-green-500"
                />
                <div className="mt-1 flex justify-between text-xs text-slate-500">
                  <span>1</span>
                  <span>10</span>
                  <span>30</span>
                  <span>60</span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300" suppressHydrationWarning>
                  {t('challenge.incrementSeconds', { increment: challengeIncrement })}
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={challengeIncrement}
                  onChange={(e) => setChallengeIncrement(Number(e.target.value))}
                  className="w-full accent-green-500"
                />
                <div className="mt-1 flex justify-between text-xs text-slate-500">
                  <span>0</span>
                  <span>3</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>

              <div className="rounded-lg bg-slate-100 p-3 text-center dark:bg-slate-700">
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                  {challengeTime}+{challengeIncrement}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400" suppressHydrationWarning>{t('challenge.quickChess')}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setChallengeModalOpen(false);
                  setSelectedFriend(null);
                }}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              >
                <span suppressHydrationWarning>{t('challenge.cancel')}</span>
              </button>
              <button
                onClick={sendChallenge}
                className="flex-1 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-400"
              >
                <span suppressHydrationWarning>{t('challenge.sendChallenge')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Challenge Modal */}
      {pendingChallenge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-white" suppressHydrationWarning>{t('challenge.challengeReceived')}</h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400" suppressHydrationWarning>
              {t('challenge.invitesYou', { username: pendingChallenge.from.username })}
            </p>

            <div className="mb-6 rounded-lg bg-slate-100 p-4 dark:bg-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400" suppressHydrationWarning>{t('challenge.timeControl')}:</span>
                <span className="text-lg font-semibold text-green-600 dark:text-green-400">
                  {pendingChallenge.timeControlMinutes}+{pendingChallenge.incrementSeconds}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400" suppressHydrationWarning>{t('challenge.rating')}:</span>
                <span className="text-slate-900 dark:text-white">{pendingChallenge.from.rating}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDeclineChallenge}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              >
                <span suppressHydrationWarning>{t('challenge.decline')}</span>
              </button>
              <button
                onClick={handleAcceptChallenge}
                className="flex-1 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-400"
              >
                <span suppressHydrationWarning>{t('challenge.accept')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function FriendsColumn({
  title,
  items,
  emptyText,
  action,
  t,
}: {
  title: string;
  items: FriendListItem[];
  emptyText: string;
  action: (item: FriendListItem) => React.ReactNode;
  t: (key: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white" suppressHydrationWarning>{title}</h2>

      <div className="flex flex-col gap-3">
        {items.length === 0 && <p className="text-sm text-slate-500" suppressHydrationWarning>{emptyText}</p>}

        {items.map((item) => (
          <div key={item.friendshipId} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-700/50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{item.user.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">@{item.user.username ?? "unknown"}</p>
                <p className="mt-1 text-xs tracking-[0.2em] text-green-600 dark:text-green-400">{item.user.friendCode}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Rapid: {item.user.ratingRapid} · Blitz: {item.user.ratingBlitz}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`rounded-full px-2 py-1 text-xs ${item.user.isOnline ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300"}`} suppressHydrationWarning>
                  {item.user.isOnline ? t('friends.online') : t('friends.offline')}
                </span>
                {action(item)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
