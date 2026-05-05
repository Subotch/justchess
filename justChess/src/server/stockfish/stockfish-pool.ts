/**
 * Stockfish Pool — пул worker_threads для серверного AI.
 * Если воркеры недоступны (нет нативного stockfish в PATH),
 * пул помечается как недоступный и getBestMove() немедленно отклоняет промис,
 * что позволяет game.handler использовать fallback на случайный ход.
 *
 * Инициализируется через initStockfishPool() в server.js.
 * Публичный API: getBestMove(fen, depth, skillLevel) → Promise<string>
 */

import { Worker } from "worker_threads";
import path from "path";
import os from "os";

interface PoolSlot {
  worker: Worker;
  busy: boolean;
  id: number;
  healthy: boolean;
}

interface PendingRequest {
  fen: string;
  depth: number;
  skillLevel: number;
  resolve: (move: string) => void;
  reject: (err: Error) => void;
}

const POOL_SIZE = Math.max(2, Math.floor(os.cpus().length / 2));
const WORKER_PATH = path.resolve(__dirname, "./stockfish-worker.js");

const pool: PoolSlot[] = [];
const queue: PendingRequest[] = [];

let poolAvailable = false;
let initAttempted = false;

function createWorker(id: number): PoolSlot {
  const worker = new Worker(WORKER_PATH);
  const slot: PoolSlot = { worker, busy: false, id, healthy: true };

  worker.on("error", (err) => {
    // Не спамить в консоль: логируем только первый сбой
    if (slot.healthy) {
      console.warn(`[stockfish-pool] Worker #${id} недоступен: ${err.message}`);
    }
    slot.healthy = false;
    slot.busy = false;
    // Сбрасываем очередь — всем отказать
    drainQueueWithError();
  });

  worker.on("exit", (code) => {
    if (code !== 0 && slot.healthy) {
      console.warn(`[stockfish-pool] Worker #${id} завершился с кодом ${code}`);
      slot.healthy = false;
    }
    // Не перезапускаем — пусть game.handler использует fallback
  });

  return slot;
}

/**
 * Инициализирует пул воркеров Stockfish.
 * Проверяет, доступен ли скомпилированный воркер.
 * Если нет — молча пропускает, game.handler будет использовать fallback.
 */
export function initStockfishPool(): void {
  if (initAttempted) return;
  initAttempted = true;

  // Проверяем что файл воркера существует
  const fs = require("fs");
  if (!fs.existsSync(WORKER_PATH)) {
    console.log(
      `[stockfish-pool] Воркер не найден (${WORKER_PATH}). ` +
      `AI будет использовать случайные ходы. ` +
      `Для Stockfish AI: скомпилируйте TypeScript серверных файлов.`
    );
    return;
  }

  try {
    for (let i = 0; i < POOL_SIZE; i++) {
      pool.push(createWorker(i));
    }
    poolAvailable = true;
    console.log(`[stockfish-pool] Инициализирован пул из ${POOL_SIZE} воркеров`);
  } catch (err) {
    console.warn("[stockfish-pool] Не удалось создать воркеры, AI использует случайные ходы:", err);
  }
}

/**
 * Возвращает лучший ход по FEN позиции.
 * Если пул недоступен — сразу отклоняет промис (game.handler перейдёт на fallback).
 */
export function getBestMove(
  fen: string,
  depth: number,
  skillLevel: number
): Promise<string> {
  if (!poolAvailable || pool.length === 0) {
    return Promise.reject(new Error("[stockfish-pool] Пул недоступен"));
  }

  return new Promise((resolve, reject) => {
    const slot = pool.find((s) => !s.busy && s.healthy);

    if (!slot) {
      // Все воркеры заняты — ставим в очередь
      queue.push({ fen, depth, skillLevel, resolve, reject });
      return;
    }

    executeOnSlot(slot, fen, depth, skillLevel, resolve, reject);
  });
}

function executeOnSlot(
  slot: PoolSlot,
  fen: string,
  depth: number,
  skillLevel: number,
  resolve: (move: string) => void,
  reject: (err: Error) => void
): void {
  slot.busy = true;

  const timeout = setTimeout(() => {
    slot.busy = false;
    reject(new Error(`[stockfish-pool] Worker #${slot.id} timeout`));
    drainQueue();
  }, 10_000);

  const messageHandler = ({ type, move, error }: { type: string; move?: string; error?: string }) => {
    clearTimeout(timeout);
    slot.busy = false;

    if (type === "bestmove" && move) {
      resolve(move);
    } else {
      reject(new Error(error ?? "Stockfish не вернул ход"));
    }

    drainQueue();
  };

  slot.worker.once("message", messageHandler);
  slot.worker.postMessage({ fen, depth, skillLevel });
}

function drainQueue(): void {
  if (queue.length === 0) return;
  const slot = pool.find((s) => !s.busy && s.healthy);
  if (!slot) return;

  const pending = queue.shift();
  if (pending) {
    executeOnSlot(slot, pending.fen, pending.depth, pending.skillLevel, pending.resolve, pending.reject);
  }
}

function drainQueueWithError(): void {
  while (queue.length > 0) {
    const pending = queue.shift();
    pending?.reject(new Error("[stockfish-pool] Воркер недоступен"));
  }
}

/**
 * Завершает все воркеры пула (для graceful shutdown).
 */
export async function shutdownStockfishPool(): Promise<void> {
  if (!poolAvailable) return;
  await Promise.all(pool.map((s) => s.worker.terminate()));
  pool.length = 0;
  poolAvailable = false;
  console.log("[stockfish-pool] Пул завершён");
}
