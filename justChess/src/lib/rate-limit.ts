/**
 * Rate limiting utilities using rate-limiter-flexible
 * Works with in-memory store (dev) or Redis (production)
 */

import { RateLimiterMemory } from "rate-limiter-flexible";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────
// RATE LIMITER INSTANCES
// ─────────────────────────────────────────────

/** General API: 100 requests per minute */
export const apiLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
  keyPrefix: "api",
});

/** Auth endpoints: 10 attempts per 15 minutes */
export const authLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60 * 15,
  keyPrefix: "auth",
});

/** Game move endpoint: 60 moves per minute (1/sec) */
export const moveLimiter = new RateLimiterMemory({
  points: 60,
  duration: 60,
  keyPrefix: "move",
});

/** Friend requests: 20 per hour */
export const friendLimiter = new RateLimiterMemory({
  points: 20,
  duration: 60 * 60,
  keyPrefix: "friend",
});

// ─────────────────────────────────────────────
// MIDDLEWARE HELPER
// ─────────────────────────────────────────────

export async function withRateLimit(
  req: NextRequest,
  limiter: RateLimiterMemory,
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
