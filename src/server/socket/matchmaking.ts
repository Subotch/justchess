/**
 * In-memory matchmaking queue.
 * For production with multiple server instances, replace with Redis-backed queue.
 */

import type { MatchmakingEntry } from "@/types/game";

const RATING_RANGE_INITIAL = 100;   // ±100 initially
const RATING_RANGE_EXPAND = 50;     // expand by 50 every 15s
const RATING_RANGE_MAX = 500;       // max ±500
const ENTRY_TTL_MS = 60 * 1000;      // 60 seconds — remove if no heartbeat

class MatchmakingQueue {
  private queue: MatchmakingEntry[] = [];
  private lastClean = Date.now();

  /**
   * Clean expired entries (for players who disconnected).
   * Called periodically or on each operation.
   */
  cleanExpired(): void {
    const now = Date.now();
    // Clean every 10 seconds max to avoid excessive filtering
    if (now - this.lastClean < 10_000) return;

    const before = this.queue.length;
    this.queue = this.queue.filter(
      (e) => now - (e.lastHeartbeat ?? e.joinedAt ?? now) < ENTRY_TTL_MS
    );
    this.lastClean = now;

    if (this.queue.length < before) {
      console.log(`[matchmaking] cleaned ${before - this.queue.length} expired entries`);
    }
  }

  /**
   * Update heartbeat — keep player alive in queue.
   */
  heartbeat(userId: string): void {
    const entry = this.queue.find((e) => e.userId === userId);
    if (entry) {
      entry.lastHeartbeat = Date.now();
    }
  }

/**
   * Add a player to the queue.
   */
  add(entry: MatchmakingEntry): void {
    // Remove any existing entry for this user
    this.remove(entry.userId);
    // Set initial heartbeat timestamp
    entry.lastHeartbeat = Date.now();
    this.queue.push(entry);
    // Clean expired on add
    this.cleanExpired();
  }

  /**
   * Remove a player from the queue.
   */
  remove(userId: string): void {
    this.queue = this.queue.filter((e) => e.userId !== userId);
  }

/**
   * Find a suitable match for the given entry.
   * Returns the matched entry and removes both from queue.
   */
  findMatch(entry: MatchmakingEntry): MatchmakingEntry | null {
    // Clean expired before matching
    this.cleanExpired();

    const { request, rating, joinedAt } = entry;
    const waitSeconds = (Date.now() - joinedAt) / 1000;

    // Expand rating range over time
    const expansions = Math.floor(waitSeconds / 15);
    const ratingRange = Math.min(
      RATING_RANGE_INITIAL + expansions * RATING_RANGE_EXPAND,
      RATING_RANGE_MAX
    );

    for (let i = 0; i < this.queue.length; i++) {
      const candidate = this.queue[i];

      // Skip self
      if (candidate.userId === entry.userId) continue;

      // Must match time control
      if (
        candidate.request.timeControlMinutes !== request.timeControlMinutes ||
        candidate.request.incrementSeconds !== request.incrementSeconds
      ) {
        continue;
      }

      // Must match game type (rated vs casual)
      if (candidate.request.gameType !== request.gameType) continue;

      // Check rating range (use the wider of the two ranges)
      const candidateWait = (Date.now() - candidate.joinedAt) / 1000;
      const candidateExpansions = Math.floor(candidateWait / 15);
      const candidateRange = Math.min(
        RATING_RANGE_INITIAL + candidateExpansions * RATING_RANGE_EXPAND,
        RATING_RANGE_MAX
      );
      const effectiveRange = Math.max(ratingRange, candidateRange);

      if (Math.abs(candidate.rating - rating) <= effectiveRange) {
        // Found a match — remove candidate from queue
        this.queue.splice(i, 1);
        return candidate;
      }
    }

    return null;
  }

  /**
   * Get queue position for a user (1-based).
   */
  getPosition(userId: string): number {
    const idx = this.queue.findIndex((e) => e.userId === userId);
    return idx === -1 ? 0 : idx + 1;
  }

  /**
   * Get queue size.
   */
  get size(): number {
    return this.queue.length;
  }
}

export const matchmakingQueue = new MatchmakingQueue();
