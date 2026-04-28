/**
 * Simple async queue for serializing operations on a per-key basis.
 * Prevents race conditions in async handlers that share mutable state
 * (e.g. clock operations for the same gameId).
 *
 * Usage:
 *   const q = new AsyncQueue();
 *   const result = await q.enqueue("gameId", async () => { ... });
 */

export class AsyncQueue {
  /** Tail of the per-key chain. New work is appended after this promise resolves. */
  private tails = new Map<string, Promise<unknown>>();

  /**
   * Enqueue an async function to run sequentially for the given key.
   * Returns a promise that resolves with the function's result (or rejects
   * with its error). Errors do NOT break the chain — subsequent items still run.
   */
  enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();

    // Chain new work after the previous tail, swallowing prior errors so a
    // single failure doesn't poison the queue for this key.
    const next = previous.then(fn, fn);

    // Store the next tail (always-resolving variant) so future enqueues chain
    // off it without inheriting rejection state.
    const tail = next.then(
      () => undefined,
      () => undefined
    );
    this.tails.set(key, tail);

    // Best-effort cleanup: if no new work was enqueued in the meantime,
    // remove the entry so the map doesn't grow unbounded.
    tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });

    return next;
  }

  /**
   * Drop the queue for a specific key (e.g., when a game ends).
   * In-flight operations continue but new chained items will start fresh.
   */
  clear(key: string): void {
    this.tails.delete(key);
  }

  /**
   * Drop all queues.
   */
  clearAll(): void {
    this.tails.clear();
  }
}
