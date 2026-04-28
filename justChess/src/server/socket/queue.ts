/**
 * Simple async queue for serializing operations on a per-game basis.
 * Prevents race conditions in clock operations.
 */

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

export class AsyncQueue {
  private queues = new Map<string, Promise<void>>();

  /**
   * Enqueue a function to run sequentially for a given key.
   */
  enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.queues.get(key);

    const promise = new Promise<T>((resolve, reject) => {
      const queueItem: QueueItem<T> = { fn, resolve, reject };

      const process = async () => {
        try {
          const result = await queueItem.fn();
          resolve(result);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        } finally {
          // Remove this item and process next
          this.queues.set(key, this.queues.get(key)?.then(() => undefined, () => undefined));
        }
      };

      if (existing) {
        // Append to existing queue
        this.queues.set(
          key,
          existing.then(() => process(), () => process())
        );
      } else {
        // Start new queue
        this.queues.set(key, process().catch(() => undefined));
      }
    });

    return promise;
  }

  /**
   * Clear queue for a specific key (e.g., when game ends).
   */
  clear(key: string): void {
    this.queues.delete(key);
  }

  /**
   * Clear all queues.
   */
  clearAll(): void {
    this.queues.clear();
  }
}
