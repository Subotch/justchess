/**
 * Ручной скрипт для проверки работы Stockfish в dev-режиме.
 * Запуск: npx tsx scripts/test-stockfish.ts
 *
 * Основной интеграционный тест расположен в:
 * tests/integration/stockfish-pool.test.ts
 */
export {};

import { initStockfishPool, getBestMove, shutdownStockfishPool } from "../src/server/stockfish/stockfish-pool";

initStockfishPool();

setTimeout(async () => {
  console.log("Testing getBestMove...");
  try {
    const move = await getBestMove(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      5,
      5
    );
    console.log("SUCCESS - AI move:", move);
    await shutdownStockfishPool();
    process.exit(0);
  } catch (err: unknown) {
    console.error("FAILED:", (err as Error).message);
    process.exit(1);
  }
}, 2000);

setTimeout(() => {
  console.error("TIMEOUT - pool did not respond");
  process.exit(1);
}, 20000);
