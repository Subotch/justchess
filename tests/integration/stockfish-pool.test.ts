/**
 * Интеграционный тест пула Stockfish (stockfish-pool.ts).
 * Запуск с Vitest: npx vitest run tests/integration/stockfish-pool.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initStockfishPool, getBestMove, shutdownStockfishPool } from "../../src/server/stockfish/stockfish-pool";

beforeAll(() => {
  initStockfishPool();
});

afterAll(async () => {
  await shutdownStockfishPool();
});

describe("Stockfish Pool Integration", () => {
  it("getBestMove возвращает ход UCI для заданной позиции", async () => {
    const move = await getBestMove(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      5,
      5
    );

    // UCI ход: 4 символа (from + to), иногда 5 с превращением
    expect(typeof move).toBe("string");
    expect(move.length).toBeGreaterThanOrEqual(4);
    expect(move.length).toBeLessThanOrEqual(5);
    expect(move).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
  }, 20_000);
});
