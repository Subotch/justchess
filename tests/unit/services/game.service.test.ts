/**
 * Unit tests for game.service.ts
 * DB calls are mocked via vi.mock — no real DB connection required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock db ────────────────────────────────────────────────────────────────
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "game-1" }]) }) }),
    query: {
      games: { findFirst: vi.fn() },
      gameMoves: { findMany: vi.fn() },
      userStats: { findFirst: vi.fn() },
    },
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
  },
}));

vi.mock("@/services/achievement.service", () => ({
  achievementService: {
    checkAndAwardAchievements: vi.fn().mockResolvedValue([]),
  },
}));

import { db } from "@/db";
import { gameService } from "@/services/game.service";

const mockDb = db as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("gameService.getGame", () => {
  it("возвращает null если игра не найдена", async () => {
    mockDb.query.games.findFirst.mockResolvedValueOnce(null);
    const result = await gameService.getGame("non-existent");
    expect(result).toBeNull();
  });

  it("возвращает игру при существующем id", async () => {
    const mockGame = {
      id: "game-1",
      status: "active",
      whitePlayerId: "user-1",
      blackPlayerId: "user-2",
      timeControlMinutes: 5,
      incrementSeconds: 0,
      isAiGame: false,
    };
    mockDb.query.games.findFirst.mockResolvedValueOnce(mockGame);
    const result = await gameService.getGame("game-1");
    expect(result).toEqual(mockGame);
    expect(result?.id).toBe("game-1");
  });
});

describe("gameService.getGameMoves", () => {
  it("возвращает пустой массив если ходов нет", async () => {
    mockDb.query.gameMoves.findMany.mockResolvedValueOnce([]);
    const moves = await gameService.getGameMoves("game-1");
    expect(moves).toHaveLength(0);
  });

  it("возвращает список ходов", async () => {
    const mockMoves = [
      { id: "m1", gameId: "game-1", san: "e4", uci: "e2e4", fen: "...", moveNumber: 1, color: "white" },
      { id: "m2", gameId: "game-1", san: "e5", uci: "e7e5", fen: "...", moveNumber: 1, color: "black" },
    ];
    mockDb.query.gameMoves.findMany.mockResolvedValueOnce(mockMoves);
    const moves = await gameService.getGameMoves("game-1");
    expect(moves).toHaveLength(2);
    expect(moves[0].san).toBe("e4");
  });
});

describe("gameService.makeMove — валидация", () => {
  it("возвращает ошибку если игра не найдена", async () => {
    mockDb.query.games.findFirst.mockResolvedValueOnce(null);
    const result = await gameService.makeMove({
      gameId: "non-existent",
      userId: "user-1",
      from: "e2",
      to: "e4",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("возвращает ошибку если игра не активна", async () => {
    mockDb.query.games.findFirst.mockResolvedValueOnce({
      id: "game-1",
      status: "finished",
      whitePlayerId: "user-1",
      blackPlayerId: "user-2",
      timeControlMinutes: 5,
      incrementSeconds: 0,
      isAiGame: false,
      finalFen: null,
      pgn: null,
    });
    mockDb.query.gameMoves.findMany.mockResolvedValueOnce([]);
    const result = await gameService.makeMove({
      gameId: "game-1",
      userId: "user-1",
      from: "e2",
      to: "e4",
    });
    expect(result.success).toBe(false);
  });

  it("возвращает ошибку если не очередь игрока", async () => {
    // Начальная позиция — ход белых, но user-2 — чёрные
    mockDb.query.games.findFirst.mockResolvedValueOnce({
      id: "game-1",
      status: "active",
      whitePlayerId: "user-1",
      blackPlayerId: "user-2",
      timeControlMinutes: 5,
      incrementSeconds: 0,
      isAiGame: false,
      finalFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      pgn: null,
    });
    mockDb.query.gameMoves.findMany.mockResolvedValueOnce([]);
    const result = await gameService.makeMove({
      gameId: "game-1",
      userId: "user-2", // чёрные пытаются ходить первыми
      from: "e7",
      to: "e5",
    });
    expect(result.success).toBe(false);
  });
});