/**
 * Rate limiting utilities using rate-limiter-flexible.
 * При наличии REDIS_URL — использует RateLimiterRedis (масштабируемый).
 * Без REDIS_URL — RateLimiterMemory (dev / single-instance).
 */

import {
  RateLimiterMemory,
  RateLimiterRedis,
  type RateLimiterAbstract,
} from "rate-limiter-flexible";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────
// ФАБРИКА ЛИМИТЕРОВ
// ─────────────────────────────────────────────

function createLimiter(opts: {
  points: number;
  duration: number;
  keyPrefix: string;
}): RateLimiterAbstract {
  if (process.env.REDIS_URL) {
    // Ленивый импорт чтобы не падать в браузере / во время сборки
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require("redis");
    const redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.connect().catch((err: Error) =>
      console.error("[rate-limit] Redis connection error:", err)
    );
    return new RateLimiterRedis({
      storeClient: redisClient,
      ...opts,
    });
  }
  return new RateLimiterMemory(opts);
}

// ─────────────────────────────────────────────
// RATE LIMITER INSTANCES
// ─────────────────────────────────────────────

/** General API: 100 requests per minute */
export const apiLimiter = createLimiter({
  points: 100,
  duration: 60,
  keyPrefix: "api",
});

/** Auth endpoints: 10 attempts per 15 minutes */
export const authLimiter = createLimiter({
  points: 10,
  duration: 60 * 15,
  keyPrefix: "auth",
});

/** Game move endpoint: 60 moves per minute (1/sec) */
export const moveLimiter = createLimiter({
  points: 60,
  duration: 60,
  keyPrefix: "move",
});

/** Friend requests: 20 per hour */
export const friendLimiter = createLimiter({
  points: 20,
  duration: 60 * 60,
  keyPrefix: "friend",
});

// ─────────────────────────────────────────────
// MIDDLEWARE HELPER
// ─────────────────────────────────────────────

export async function withRateLimit(
  req: NextRequest,
  limiter: RateLimiterAbstract,
  keyFn?: (req: NextRequest) => string
): Promise<NextResponse | null> {
  const key = keyFn
    ? keyFn(req)
    : req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "anonymous";

  try {
    await limiter.consume(key);
    return null; // OK — continue
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please slow down.",
        },
      },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      }
    );
  }
}
