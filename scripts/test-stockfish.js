/**
 * Ручной скрипт для проверки работы Stockfish в dev-режиме.
 * Запуск: npx tsx scripts/test-stockfish.js
 *
 * @deprecated Используйте tests/integration/stockfish-pool.test.ts
 */
// Перенаправляем на integration тест
require("child_process")
  .spawnSync(process.execPath, [require.resolve("tsx"), "tests/integration/stockfish-pool.test.ts"], {
    stdio: "inherit",
    cwd: __dirname + "/..",
  });
