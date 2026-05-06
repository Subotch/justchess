/**
 * Интеграционный тест пула Stockfish (stockfish-pool.ts).
 * Запуск: npx tsx tests/integration/stockfish-pool.test.ts
 */
import { initStockfishPool, getBestMove, shutdownStockfishPool } from "../../src/server/stockfish/stockfish-pool";

initStockfishPool();

// Подождём пока дочерние процессы стартуют и сделаем запрос
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
