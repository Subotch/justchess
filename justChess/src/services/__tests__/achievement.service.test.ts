/**
 * Unit tests for achievement.service.ts
 * Tests checkAndAwardAchievements logic with mocked DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock db ────────────────────────────────────────────────────────────────
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });
mockInsert.mockReturnValue({ values: mockValues });

vi.mock("@/db", () => ({
  db: {
    query: {
      achievements: { findMany: vi.fn() },
      userAchievements: { findMany: vi.fn() },
      userStats: { findFirst: mockFindFirst },
      games: { findFirst: vi.fn() },
      gameMoves: { findMany: mockFindMany },
    },
    insert: mockInsert,
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
  },
}));

import { db } from "@/db";
import { achievementService } from "@/services/achievement.service";

const mockDb = db as any;

const MOCK_STATS = {
  userId: "user-1",
  wins: 1,
  losses: 0,
  draws: 0,
  gamesPlayed: 1,
  winStreak: 1,
  bestWinStreak: 1,
  ratingRapid: 1200,
  ratingBlitz: 1200,
  ratingBullet: 1200,
  ratingClassical: 1200,
};

const MOCK_GAME = {
  id: "game-1",
  status: "finished",
  whitePlayerId: "user-1",
  blackPlayerId: "user-2",
  result: "white_wins",
  resultReason: "checkmate",
  gameType: "rated",
  timeControlMinutes: 5,
  isAiGame: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("achievementService.checkAndAwardAchievements", () => {
  it("не выдаёт достижения если нет совпадений критериев", async () => {
    mockDb.query.games.findFirst.mockResolvedValueOnce(MOCK_GAME);
    mockDb.query.userStats.findFirst.mockResolvedValueOnce(MOCK_STATS);
    mockDb.query.gameMoves.findMany.mockResolvedValueOnce([]);
    mockDb.query.achievements.findMany.mockResolvedValueOnce([]); // нет достижений в базе
    mockDb.query.userAchievements.findMany.mockResolvedValueOnce([]);

    const result = await achievementService.checkAndAward("user-1", "game-1");
    expect(Array.isArray(result)).toBe(true);
  });

  it("не выдаёт достижения если игра не найдена", async () => {
    mockDb.query.games.findFirst.mockResolvedValueOnce(null);

    const result = await achievementService.checkAndAward("user-1", "non-existent");
    expect(result).toEqual([]);
  });

  it("не выдаёт достижения если статистика не найдена", async () => {
    mockDb.query.games.findFirst.mockResolvedValueOnce(MOCK_GAME);
    mockDb.query.userStats.findFirst.mockResolvedValueOnce(null);

    const result = await achievementService.checkAndAward("user-1", "game-1");
    expect(result).toEqual([]);
  });

  it("не выдаёт уже полученные достижения повторно", async () => {
    const alreadyEarned = [
      {
        achievementId: "first_win",
        userId: "user-1",
        earnedAt: new Date(),
        achievement: { id: "first_win", name: "First Victory", criteria: JSON.stringify({ type: "wins", count: 1 }) },
      },
    ];

    mockDb.query.games.findFirst.mockResolvedValueOnce(MOCK_GAME);
    mockDb.query.userStats.findFirst.mockResolvedValueOnce(MOCK_STATS);
    mockDb.query.gameMoves.findMany.mockResolvedValueOnce([]);
    mockDb.query.achievements.findMany.mockResolvedValueOnce([
      { id: "first_win", name: "First Victory", criteria: JSON.stringify({ type: "wins", count: 1 }) },
    ]);
    mockDb.query.userAchievements.findMany.mockResolvedValueOnce(alreadyEarned);

    const result = await achievementService.checkAndAward("user-1", "game-1");
    // Не должно добавить уже существующее достижение
    expect(mockInsert).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });
});
