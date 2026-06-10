/**
 * Unit tests for rate-limit.middleware.ts
 * Tests createRateLimiter, withRateLimit, getRateLimitStats, clearRateLimitState.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createRateLimiter,
  withRateLimit,
  getRateLimitStats,
  clearRateLimitState,
} from "../../../../src/server/socket/middleware/rate-limit.middleware";

// Minimal mock socket
function makeMockSocket(id = "socket-1"): any {
  const events: Map<string, Function[]> = new Map();
  return {
    id,
    data: {},
    emit: vi.fn(),
    on: (event: string, handler: Function) => {
      if (!events.has(event)) events.set(event, []);
      events.get(event)!.push(handler);
    },
    _emit: (event: string, ...args: any[]) => {
      const handlers = events.get(event) ?? [];
      for (const h of handlers) h(...args);
    },
  };
}

beforeEach(() => {
  clearRateLimitState();
});

describe("createRateLimiter", () => {
  it("пропускает запросы в пределах лимита", async () => {
    const limiter = createRateLimiter("game:move", { maxEvents: 3, windowMs: 1000 });
    const socket = makeMockSocket();
    const handler = vi.fn().mockResolvedValue(undefined);

    const limited = limiter(socket, handler);

    await limited({ gameId: "g1" });
    await limited({ gameId: "g1" });
    await limited({ gameId: "g1" });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("блокирует запросы сверх лимита", async () => {
    const limiter = createRateLimiter("game:move", { maxEvents: 2, windowMs: 1000 });
    const socket = makeMockSocket();
    const handler = vi.fn().mockResolvedValue(undefined);

    const limited = limiter(socket, handler);

    await limited({});
    await limited({});
    await limited({}); // третий — сверх лимита

    expect(handler).toHaveBeenCalledTimes(2);
    expect(socket.emit).toHaveBeenCalledWith(
      "error:rate_limited",
      expect.objectContaining({ code: "RATE_LIMITED" })
    );
  });

  it("использует default-лимиты для game:move", async () => {
    const limiter = createRateLimiter("game:move");
    const socket = makeMockSocket();
    const handler = vi.fn().mockResolvedValue(undefined);

    const limited = limiter(socket, handler);

    // Default: 3/сек — 4-й должен быть заблокирован
    for (let i = 0; i < 4; i++) await limited({});
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("возвращает 429 с retryAfterMs", async () => {
    const limiter = createRateLimiter("game:resign", { maxEvents: 1, windowMs: 3000 });
    const socket = makeMockSocket();
    const handler = vi.fn().mockResolvedValue(undefined);

    const limited = limiter(socket, handler);

    await limited({});
    await limited({});

    const emitCall = (socket.emit as any).mock.calls[0];
    expect(emitCall[1].retryAfterMs).toBe(3000);
  });

  it("незарегистрированное событие использует fallback 5/сек", async () => {
    const limiter = createRateLimiter("custom:event", { maxEvents: 2, windowMs: 1000 });
    const socket = makeMockSocket();
    const handler = vi.fn().mockResolvedValue(undefined);

    const limited = limiter(socket, handler);

    await limited({});
    await limited({});
    await limited({});

    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe("withRateLimit", () => {
  it("регистрирует обработчик на socket и вызывает его", async () => {
    const socket = makeMockSocket();
    const handler = vi.fn().mockResolvedValue(undefined);

    withRateLimit(socket, "game:move", handler, { maxEvents: 5, windowMs: 1000 });

    // Trigger the registered event
    socket._emit("game:move", { gameId: "g1" });
    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("при превышении лимита — не вызывает handler", async () => {
    const socket = makeMockSocket();
    const handler = vi.fn().mockResolvedValue(undefined);

    withRateLimit(socket, "game:chat_message", handler, { maxEvents: 2, windowMs: 2000 });

    socket._emit("game:chat_message", { message: "a" });
    socket._emit("game:chat_message", { message: "b" });
    socket._emit("game:chat_message", { message: "c" });
    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledTimes(2);
    expect(socket.emit).toHaveBeenCalledWith(
      "error:rate_limited",
      expect.objectContaining({ event: "game:chat_message" })
    );
  });
});

describe("getRateLimitStats", () => {
  it("возвращает пустой объект для неизвестного socket", () => {
    const stats = getRateLimitStats("unknown-socket");
    expect(stats).toEqual({});
  });

  it("возвращает статистику после запросов", async () => {
    const limiter = createRateLimiter("game:move", { maxEvents: 3, windowMs: 1000 });
    const socket = makeMockSocket("socket-x");
    const handler = vi.fn().mockResolvedValue(undefined);
    const limited = limiter(socket, handler);

    await limited({});
    await limited({});

    const stats = getRateLimitStats("socket-x");
    expect(stats["game:move"].count).toBe(2);
    expect(stats["game:move"].resetInMs).toBeGreaterThan(0);
    expect(stats["game:move"].resetInMs).toBeLessThanOrEqual(1000);
  });
});

describe("clearRateLimitState", () => {
  it("очищает состояние", async () => {
    const limiter = createRateLimiter("game:move", { maxEvents: 3, windowMs: 1000 });
    const socket = makeMockSocket();
    const handler = vi.fn().mockResolvedValue(undefined);
    const limited = limiter(socket, handler);

    await limited({});
    await limited({});
    expect(getRateLimitStats("socket-1")["game:move"].count).toBe(2);

    clearRateLimitState();
    expect(getRateLimitStats("socket-1")).toEqual({});
  });
});