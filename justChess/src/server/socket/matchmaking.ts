/**
 * In-memory matchmaking queue.
 * For production with multiple server instances, replace with Redis-backed queue.
 */

import type { MatchmakingEntry } from "@/types/game";

const RATING_RANGE_INITIAL = 100;   // ±100 initially
const RATING_RANGE_EXPAND = 50;     // expand by 50 every 15s
const RATING_RANGE_MAX = 500;       // max ±500

class MatchmakingQueue {
  private queue: MatchmakingEntry[] = [];

  /**
   * Add a player to the queue.
   */
  add(entry: MatchmakingEntry): void {
    // Remove any existing entry for this user
    this.remove(entry.userId);
    this.queue.push(entry);
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
