/**
 * Unit tests for AsyncQueue (src/server/socket/queue.ts)
 * Tests sequential execution, parallel keys, error isolation, clear.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AsyncQueue } from "../../../../src/server/socket/queue";

function makeQueue(): AsyncQueue {
  return new AsyncQueue();
}

describe("AsyncQueue — sequential execution per key", () => {
  it("выполняет задачи последовательно, результаты в порядке добавления", async () => {
    const q = makeQueue();
    const order: number[] = [];

    const p1 = q.enqueue("key", async () => {
      await delay(30);
      order.push(1);
      return "first";
    });
    const p2 = q.enqueue("key", async () => {
      order.push(2);
      return "second";
    });
    const p3 = q.enqueue("key", async () => {
      order.push(3);
      return "third";
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
    expect([r1, r2, r3]).toEqual(["first", "second", "third"]);
  });

  it("первая задача должна завершиться до второй", async () => {
    const q = makeQueue();
    const log: string[] = [];

    q.enqueue("k", async () => { log.push("A-start"); await delay(20); log.push("A-end"); return "A"; });
    q.enqueue("k", async () => { log.push("B"); return "B"; });

    await delay(50);
    expect(log).toEqual(["A-start", "A-end", "B"]);
  });
});

describe("AsyncQueue — parallel keys are independent", () => {
  it("разные ключи выполняются параллельно", async () => {
    const q = makeQueue();
    const results = await Promise.all([
      q.enqueue("key-a", async () => { await delay(20); return "a"; }),
      q.enqueue("key-b", async () => { await delay(10); return "b"; }),
      q.enqueue("key-c", async () => { await delay(5); return "c"; }),
    ]);
    expect(results).toEqual(["a", "b", "c"]);
  });
});

describe("AsyncQueue — error isolation", () => {
  it("ошибка одной задачи не ломает последующие для того же ключа", async () => {
    const q = makeQueue();

    const p1 = q.enqueue("key", async () => { throw new Error("boom"); });
    // Задача 2 начинает выполняться сразу после того, как p1 отклоняется (tail resolved)
    const p2 = q.enqueue("key", async () => "after-error");

    // Первая отклоняется
    await expect(p1).rejects.toThrow("boom");
    // Вторая всё ещё выполняется и завершается успешно
    await expect(p2).resolves.toBe("after-error");
  });

  it("ошибка не влияет на задачи другого ключа", async () => {
    const q = makeQueue();

    q.enqueue("key-a", async () => { throw new Error("fail-a"); });
    const p2 = q.enqueue("key-b", async () => "ok-b");

    await expect(p2).resolves.toBe("ok-b");
  });
});

describe("AsyncQueue — clear / clearAll", () => {
  it("clear удаляет очередь по ключу", async () => {
    const q = makeQueue();
    q.enqueue("k1", async () => { await delay(20); return "v1"; });
    q.enqueue("k2", async () => { await delay(10); return "v2"; });

    q.clear("k1");
    // k1 и k2 всё равно выполняются (in-flight не отменяются)
    // Новые enqueue после clear для того же ключа начинают свежую цепочку
    const fresh = q.enqueue("k1", async () => "fresh");
    await expect(fresh).resolves.toBe("fresh");
  });

  it("clearAll очищает все очереди", async () => {
    const q = makeQueue();
    q.enqueue("a", async () => "a-val");
    q.enqueue("b", async () => "b-val");

    q.clearAll();

    const p = q.enqueue("c", async () => "c-val");
    await expect(p).resolves.toBe("c-val");
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}