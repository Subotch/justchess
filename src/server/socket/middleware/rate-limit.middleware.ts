/**
 * Socket.IO Rate Limiting Middleware
 * Protects against spam attacks and DoS on socket events
 */

import type { Socket } from "socket.io";
import type { SocketData } from "@/types/socket";

type AppSocket = Socket<any, any, any, SocketData>;

/** Configuration for each event's rate limit */
interface RateLimitConfig {
  /** Max number of events allowed */
  maxEvents: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/** Default rate limit configs per event type */
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  "game:move": { maxEvents: 3, windowMs: 1000 },       // 3 moves per second max
  "game:chat_message": { maxEvents: 2, windowMs: 2000 }, // 2 messages per 2 seconds
  "game:offer_draw": { maxEvents: 2, windowMs: 5000 },  // 2 offers per 5 seconds
  "game:resign": { maxEvents: 1, windowMs: 3000 },       // 1 resign per 3 seconds
};

/** In-memory store for rate limiting state: socketId -> eventType -> timestamps */
const rateLimitState = new Map<string, Map<string, number[]>>();

/** Cleanup old entries periodically (every 5 minutes) */
setInterval(() => {
  const now = Date.now();
  const maxAge = 60000; // 1 minute max age for any entry
  
  for (const [socketId, events] of rateLimitState.entries()) {
    for (const [eventType, timestamps] of events.entries()) {
      // Filter out old timestamps
      const validTimestamps = timestamps.filter((ts) => now - ts < maxAge);
      if (validTimestamps.length === 0) {
        events.delete(eventType);
      } else {
        events.set(eventType, validTimestamps);
      }
    }
    
    if (events.size === 0) {
      rateLimitState.delete(socketId);
    }
  }
}, 300000);

/**
 * Creates a rate limiter middleware for a specific socket event
 * @param eventName - The socket event name to rate limit
 * @param customLimit - Optional custom limit config (overrides default)
 */
export function createRateLimiter(
  eventName: string,
  customLimit?: RateLimitConfig
): (socket: AppSocket, handler: (...args: any[]) => Promise<void>) => (...args: any[]) => Promise<void> {
  const limit = customLimit ?? DEFAULT_LIMITS[eventName] ?? { maxEvents: 5, windowMs: 1000 };

  return function rateLimitMiddleware(
    socket: AppSocket,
    handler: (...args: any[]) => Promise<void>
  ): (...args: any[]) => Promise<void> {
    return async function rateLimitedHandler(...args: any[]): Promise<void> {
      const socketId = socket.id;
      const now = Date.now();

      // Initialize socket entry if not exists
      if (!rateLimitState.has(socketId)) {
        rateLimitState.set(socketId, new Map());
      }

      const socketEvents = rateLimitState.get(socketId)!;

      // Initialize event entry if not exists
      if (!socketEvents.has(eventName)) {
        socketEvents.set(eventName, []);
      }

      const eventTimestamps = socketEvents.get(eventName)!;

      // Remove timestamps outside the window
      const validTimestamps = eventTimestamps.filter((ts) => now - ts < limit.windowMs);
      socketEvents.set(eventName, validTimestamps);

      // Check rate limit
      if (validTimestamps.length >= limit.maxEvents) {
        console.warn(`[RateLimit] Socket ${socketId} exceeded limit for "${eventName}"`);
        socket.emit("error:rate_limited", {
          code: "RATE_LIMITED",
          message: "Too many requests. Please slow down.",
          event: eventName,
          retryAfterMs: limit.windowMs,
        });
        return;
      }

      // Add current timestamp
      validTimestamps.push(now);
      socketEvents.set(eventName, validTimestamps);

      // Proceed with the handler
      await handler(...args);
    };
  };
}

/**
 * Creates rate-limited socket event handlers with automatic cleanup on disconnect
 * @param socket - The socket instance
 * @param eventName - The event name to limit
 * @param handler - The original event handler
 * @param customLimit - Optional custom limit config
 */
export function withRateLimit(
  socket: AppSocket,
  eventName: string,
  handler: (...args: any[]) => Promise<void>,
  customLimit?: RateLimitConfig
): void {
  const limiter = createRateLimiter(eventName, customLimit);
  const limitedHandler = limiter(socket, handler);

  socket.on(eventName, limitedHandler);

  // Cleanup on disconnect
  socket.on("disconnect", () => {
    rateLimitState.delete(socket.id);
  });
}

/** Get current rate limit stats for a socket (useful for monitoring) */
export function getRateLimitStats(socketId: string): Record<string, { count: number; resetInMs: number }> {
  const socketEvents = rateLimitState.get(socketId);
  if (!socketEvents) return {};

  const now = Date.now();
  const stats: Record<string, { count: number; resetInMs: number }> = {};

  for (const [eventType, timestamps] of socketEvents.entries()) {
    const validTimestamps = timestamps.filter((ts) => now - ts < (DEFAULT_LIMITS[eventType]?.windowMs ?? 1000));
    if (validTimestamps.length > 0) {
      const oldest = Math.min(...validTimestamps);
      const limit = DEFAULT_LIMITS[eventType] ?? { windowMs: 1000 };
      stats[eventType] = {
        count: validTimestamps.length,
        resetInMs: oldest + limit.windowMs - now,
      };
    }
  }

  return stats;
}

/** Clear all rate limit data (useful for testing) */
export function clearRateLimitState(): void {
  rateLimitState.clear();
}