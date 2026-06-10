/**
 * Unit tests for clock-manager.ts
 * Tests tick, switchTurn (race guard), pause/resume, timeouts, reconnect timers.
 * Uses the exported singleton. Reset state via stopClock between tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clockManager } from "../../../../src/server/socket/clock-manager";

const GAME_ID = "game-1";
const WHITE_ID = "white-user";
const BLACK_ID = "black-user";

beforeEach(() => {
  clockManager.stopClock(GAME_ID);
  clockManager.stopClock("game-2");
});

afterEach(() => {
  clockManager.stopClock(GAME_ID);
  clockManager.stopClock("game-2");
  vi.restoreAllMocks();
});

describe("ClockManager.startClock / stopClock", () => {
  beforeEach(() => {
    clockManager.stopClock(GAME_ID);
    clockManager.stopClock("game-2");
  });

  afterEach(() => {
    clockManager.stopClock(GAME_ID);
    clockManager.stopClock("game-2");
  });

  it("создаёт состояние часов и вызывает onTick после задержки", async () => {
    const tickCalls: any[] = [];
    clockManager.startClock(
      GAME_ID, WHITE_ID, BLACK_ID,
      60_000, 60_000, 0, "white",
      (state) => tickCalls.push(state),
      () => {}
    );

    // onTick вызывается через setTimeout ~1000ms, ждём чуть больше
    await new Promise((r) => setTimeout(r, 1500));

    expect(tickCalls.length).toBeGreaterThan(0);
    expect(clockManager.getGameState(GAME_ID)).toBeDefined();
  });

  it("stopClock удаляет состояние и очищает интервал", () => {
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 60_000, 60_000, 0, "white", vi.fn(), vi.fn());

    clockManager.stopClock(GAME_ID);

    expect(clockManager.getGameState(GAME_ID)).toBeUndefined();
  });

  it("повторный startClock останавливает предыдущие часы", async () => {
    const tick2: any[] = [];

    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 60_000, 60_000, 0, "white", vi.fn(), vi.fn());
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 30_000, 30_000, 0, "white", (s) => tick2.push(s), vi.fn());

    await new Promise((r) => setTimeout(r, 1200));
    expect(tick2.length).toBeGreaterThan(0);
    expect(clockManager.getGameState(GAME_ID)).toBeDefined();
  });
});

describe("ClockManager.tick — decrement logic", () => {
  it("тикает только активного игрока", async () => {
    const ticks: any[] = [];
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 10_000, 10_000, 0, "white", (s) => ticks.push(s), vi.fn());

    await new Promise((r) => setTimeout(r, 200));

    const lastTick = ticks[ticks.length - 1];
    expect(lastTick.activeColor).toBe("white");
    expect(lastTick.whiteTimeMs).toBeLessThan(10_000);
    expect(lastTick.blackTimeMs).toBe(10_000);
  });

  it("при времени ≤ 0 вызывает onTimeout и останавливает часы", async () => {
    const timeoutCalls: string[] = [];
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 1, 10_000, 0, "white", vi.fn(), (color) => timeoutCalls.push(color));

    await new Promise((r) => setTimeout(r, 200));

    expect(timeoutCalls).toContain("white");
    expect(clockManager.getGameState(GAME_ID)).toBeUndefined();
  });
});

describe("ClockManager.switchTurn — atomic operation", () => {
  it("переключает активный цвет и применяет инкремент", async () => {
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 60_000, 60_000, 5_000, "white", vi.fn(), vi.fn());

    const result = await clockManager.switchTurn(GAME_ID, "white");

    expect(result.success).toBe(true);
    expect(result.appliedIncrement).toBe(true);
    expect(result.newActiveColor).toBe("black");
    expect(result.whiteTimeMs).toBe(65_000);
    expect(result.blackTimeMs).toBe(60_000);
  });

  it("second switchTurn возвращает управление белым", async () => {
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 60_000, 60_000, 5_000, "white", vi.fn(), vi.fn());

    await clockManager.switchTurn(GAME_ID, "white");
    const result2 = await clockManager.switchTurn(GAME_ID, "black");

    expect(result2.success).toBe(true);
    expect(result2.newActiveColor).toBe("white");
  });

  it("при ожидаемом цвете white, но текущий уже black — appliedIncrement=false (race guard)", async () => {
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 60_000, 60_000, 5_000, "black", vi.fn(), vi.fn());

    const result = await clockManager.switchTurn(GAME_ID, "white");

    expect(result.success).toBe(true);
    expect(result.appliedIncrement).toBe(false);
    expect(result.reason).toContain("Color mismatch");
  });

  it("возвращает ошибку если часы не найдены", async () => {
    const result = await clockManager.switchTurn("non-existent-game", "white");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("Clock not found");
  });

  it("без ожидаемого цвета всё равно переключает", async () => {
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 60_000, 60_000, 5_000, "black", vi.fn(), vi.fn());

    const result = await clockManager.switchTurn(GAME_ID);

    expect(result.success).toBe(true);
    expect(result.newActiveColor).toBe("white");
  });
});

describe("ClockManager.pauseClock / resumeClock", () => {
  it("pauseClock останавливает тики", async () => {
    const ticks: any[] = [];
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 60_000, 60_000, 0, "white", (s) => ticks.push(s), vi.fn());

    const countBefore = ticks.length;
    clockManager.pauseClock(GAME_ID);

    await new Promise((r) => setTimeout(r, 300));
    const countAfter = ticks.length;

    expect(countAfter).toBe(countBefore);
  });

  it("resumeClock возобновляет тики", async () => {
    const ticks: any[] = [];
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 60_000, 60_000, 0, "white", (s) => ticks.push(s), vi.fn());

    clockManager.pauseClock(GAME_ID);
    const countBefore = ticks.length;

    clockManager.resumeClock(GAME_ID);
    await new Promise((r) => setTimeout(r, 200));

    expect(ticks.length).toBeGreaterThan(countBefore);
  });
});

describe("ClockManager.getTimeRemaining", () => {
  it("возвращает null для несуществующих часов", () => {
    expect(clockManager.getTimeRemaining("ghost-game")).toBeNull();
  });

  it("возвращает корректные значения после старта", () => {
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 90_000, 90_000, 3_000, "white", vi.fn(), vi.fn());

    const times = clockManager.getTimeRemaining(GAME_ID)!;
    expect(times.white).toBeLessThanOrEqual(90_000);
    expect(times.black).toBeLessThanOrEqual(90_000);
  });
});

describe("ClockManager.reconnect timeouts", () => {
  it("scheduleReconnectTimeout вызывает callback после истечения", async () => {
    const calls: string[] = [];
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 60_000, 60_000, 0, "white", vi.fn(), vi.fn());

    clockManager.scheduleReconnectTimeout(GAME_ID, WHITE_ID, 100, () => calls.push(WHITE_ID));

    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toContain(WHITE_ID);
  });

  it("cancelReconnectTimeout отменяет таймер", async () => {
    const calls: string[] = [];
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 60_000, 60_000, 0, "white", vi.fn(), vi.fn());

    clockManager.scheduleReconnectTimeout(GAME_ID, WHITE_ID, 50, () => calls.push(WHITE_ID));
    clockManager.cancelReconnectTimeout(GAME_ID, WHITE_ID);

    await new Promise((r) => setTimeout(r, 150));
    expect(calls).toHaveLength(0);
  });

  it("повторный scheduleReconnectTimeout заменяет предыдущий таймер", async () => {
    const calls: string[] = [];
    clockManager.startClock(GAME_ID, WHITE_ID, BLACK_ID, 60_000, 60_000, 0, "white", vi.fn(), vi.fn());

    clockManager.scheduleReconnectTimeout(GAME_ID, WHITE_ID, 10, () => calls.push("early"));
    clockManager.scheduleReconnectTimeout(GAME_ID, WHITE_ID, 200, () => calls.push("late"));

    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toContain("late");
  });
});