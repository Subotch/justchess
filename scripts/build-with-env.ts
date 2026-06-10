/**
 * build-with-env.ts — обёртка для npm run build с загрузкой .env.local
 * 
 * Запускается как: NODE_OPTIONS="--max-old-space-size=2048" npx tsx scripts/build-with-env.ts
 * 
 * Это гарантирует, что переменные из .env.local доступны во время build.
 */

import { config } from "dotenv";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

// Загрузить .env.local перед запуском build
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  config({ path: envPath });
  console.log("[build] .env.local загружен");
} else {
  console.warn("[build] .env.local не найден, используем process.env");
}

// Запустить next build с ограничением памяти
console.log("[build] Запуск next build...");
try {
  execSync("next build", {
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  console.log("[build] Build завершён успешно");
} catch (err) {
  console.error("[build] Build завершён с ошибкой");
  process.exit(1);
}

// Запустить build:worker
console.log("[build] Запуск build:worker...");
try {
  execSync("tsc --project tsconfig.worker.json", {
    stdio: "inherit",
    env: process.env,
  });
  console.log("[build] Worker build завершён успешно");
} catch (err) {
  console.error("[build] Worker build завершён с ошибкой");
  process.exit(1);
}

console.log("[build] Всё готово!");
