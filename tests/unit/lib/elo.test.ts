import { describe, it, expect } from "vitest";
import {
  getKFactor,
  expectedScore,
  calculateNewRatings,
} from "../../../src/lib/elo";

describe("getKFactor", () => {
  it("возвращает 40 для нового игрока (< 30 партий)", () => {
    expect(getKFactor(1500, 10)).toBe(40);
  });

  it("возвращает 40 для рейтинга < 1000", () => {
    expect(getKFactor(900, 50)).toBe(40);
  });

  it("возвращает 20 для рейтинга 1000-2399 с ≥ 30 партиями", () => {
    expect(getKFactor(1500, 30)).toBe(20);
    expect(getKFactor(2399, 100)).toBe(20);
  });

  it("возвращает 10 для рейтинга ≥ 2400 с ≥ 30 партиями", () => {
    expect(getKFactor(2400, 100)).toBe(10);
    expect(getKFactor(2800, 200)).toBe(10);
  });
});

describe("expectedScore", () => {
  it("равные рейтинги → ожидаемый счёт 0.5", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
  });

  it("преимущество +400 → ожидаемый счёт ≈ 0.909", () => {
    expect(expectedScore(1900, 1500)).toBeCloseTo(0.909, 2);
  });

  it("разница > 400 ограничивается до 400 (rule of 400)", () => {
    const withExact400 = expectedScore(1900, 1500);
    const withOver400 = expectedScore(2100, 1500);
    expect(withOver400).toBeCloseTo(withExact400, 5);
  });

  it("sum(E_A, E_B) = 1", () => {
    const ea = expectedScore(1600, 1400);
    const eb = expectedScore(1400, 1600);
    expect(ea + eb).toBeCloseTo(1, 10);
  });
});

describe("calculateNewRatings", () => {
  it("победа белых увеличивает рейтинг белых и уменьшает чёрных", () => {
    const result = calculateNewRatings(1500, 1500, 1);
    expect(result.whiteChange).toBeGreaterThan(0);
    expect(result.blackChange).toBeLessThan(0);
  });

  it("поражение белых уменьшает рейтинг белых и увеличивает чёрных", () => {
    const result = calculateNewRatings(1500, 1500, 0);
    expect(result.whiteChange).toBeLessThan(0);
    expect(result.blackChange).toBeGreaterThan(0);
  });

  it("ничья между равными игроками → изменение ~0", () => {
    const result = calculateNewRatings(1500, 1500, 0.5);
    expect(result.whiteChange).toBe(0);
    expect(result.blackChange).toBe(0);
  });

  it("рейтинг не опускается ниже 100", () => {
    const result = calculateNewRatings(100, 3000, 0);
    expect(result.whiteNew).toBeGreaterThanOrEqual(100);
  });

  it("победа фаворита даёт меньший прирост чем победа андердога", () => {
    const favoriteWins = calculateNewRatings(2000, 1500, 1);
    const underdogWins = calculateNewRatings(1500, 2000, 1);
    expect(underdogWins.whiteChange).toBeGreaterThan(favoriteWins.whiteChange);
  });
});