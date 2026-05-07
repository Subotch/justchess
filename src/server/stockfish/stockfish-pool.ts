/**
 * Stockfish Pool — пул дочерних процессов Stockfish WASM.
 *
 * stockfish@18 — это WASM/Emscripten пакет. Его нельзя загрузить
 * через require() внутри worker_threads (проблема пути WASM), а
 * Module.print не перехватывается при загрузке через require() в том же процессе.
 *
 * РЕШЕНИЕ: запускаем каждый экземпляр движка как отдельный дочерний процесс
 * через child_process.spawn и общаемся с ним через stdin/stdout (UCI протокол).
 *
 * Инициализируется через initStockfishPool() в server.js.
 * Публичный API: getBestMove(fen, depth, skillLevel) → Promise<string>
 */

import { spawn, ChildProcess } from "child_process";
import path from "path";
import os from "os";

// Путь к single-threaded WASM Stockfish (не требует SharedArrayBuffer)
const STOCKFISH_JS = path.join(
  process.cwd(),
  "node_modules/stockfish/bin/stockfish-18-single.js"
);

// const POOL_SIZE = Math.max(2, Math.floor(os.cpus().length / 2)); Если есть ресурсы (деньги) на ОЗУ более 512мб
const POOL_SIZE = 1

// Время простоя до автоуничтожения процесса (мс). Освобождает ~130 МБ ОЗУ в простое.
const IDLE_TIMEOUT_MS = 60_000;

interface EngineSlot {
  proc: ChildProcess;
  busy: boolean;
  id: number;
  healthy: boolean;
  lineBuffer: string;
  onLine: ((line: string) => void) | null;
  /** Таймер автоуничтожения при простое. null — процесс занят или уже убит. */
  idleTimer: ReturnType<typeof setTimeout> | null;
}

interface PendingRequest {
  fen: string;
  depth: number;
  skillLevel: number;
  resolve: (move: string) => void;
  reject: (err: Error) => void;
}

const pool: EngineSlot[] = [];
const queue: PendingRequest[] = [];

let poolAvailable = false;
let initAttempted = false;

/**
 * Планирует автоуничтожение слота через IDLE_TIMEOUT_MS.
 * Освобождает ~130 МБ ОЗУ в периоды отсутствия AI-партий.
 * При следующем запросе getBestMove слот будет пересоздан.
 */
function scheduleIdleKill(slot: EngineSlot): void {
  if (slot.idleTimer !== null) clearTimeout(slot.idleTimer);
  slot.idleTimer = setTimeout(() => {
    if (slot.busy) return; // на случай гонки
    console.log(`[stockfish-pool] Процесс #${slot.id} простаивает ${IDLE_TIMEOUT_MS / 1000}с — завершаем для экономии ОЗУ`);
    slot.healthy = false;
    slot.idleTimer = null;
    try { slot.proc.kill(); } catch {}
    // Удаляем слот из пула — при следующем запросе будет создан новый
    const idx = pool.indexOf(slot);
    if (idx !== -1) pool.splice(idx, 1);
    if (pool.length === 0) {
      // Пул пуст, но poolAvailable остаётся true — getBestMove создаст слот по требованию
      console.log("[stockfish-pool] Пул пуст (idle). Следующий запрос поднимет новый процесс.");
    }
  }, IDLE_TIMEOUT_MS);
}

function spawnSlot(id: number): EngineSlot {
  const proc = spawn(process.execPath, [STOCKFISH_JS], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const slot: EngineSlot = {
    proc,
    busy: false,
    id,
    healthy: true,
    lineBuffer: "",
    onLine: null,
    idleTimer: null,
  };

  proc.stdout!.setEncoding("utf8");
  proc.stdout!.on("data", (data: string) => {
    slot.lineBuffer += data;
    let nl: number;
    while ((nl = slot.lineBuffer.indexOf("\n")) !== -1) {
      const line = slot.lineBuffer.slice(0, nl).replace(/\r$/, "");
      slot.lineBuffer = slot.lineBuffer.slice(nl + 1);
      if (slot.onLine) {
        slot.onLine(line);
      }
    }
  });

  proc.stderr!.on("data", () => {
    // подавляем Emscripten-шум
  });

  proc.on("error", (err) => {
    if (slot.healthy) {
      console.warn(`[stockfish-pool] Процесс #${id} ошибка: ${err.message}`);
    }
    slot.healthy = false;
    slot.busy = false;
    drainQueueWithError();
    if (pool.every((s) => !s.healthy)) {
      poolAvailable = false;
      console.warn("[stockfish-pool] Все слоты недоступны — AI переходит на fallback");
    }
  });

  proc.on("exit", (code) => {
    if (code !== 0 && slot.healthy) {
      console.warn(`[stockfish-pool] Процесс #${id} завершился с кодом ${code}`);
      slot.healthy = false;
    }
  });

  // Инициализируем UCI
  proc.stdin!.write("uci\n");
  proc.stdin!.write("isready\n");

  return slot;
}

/**
 * Инициализирует пул дочерних процессов Stockfish.
 * При POOL_SIZE=1 запускает один процесс и сразу ставит ему idle-таймер.
 */
export function initStockfishPool(): void {
  if (initAttempted) return;
  initAttempted = true;

  // Проверяем что файл движка существует
  const fs = require("fs");
  if (!fs.existsSync(STOCKFISH_JS)) {
    console.warn(
      `[stockfish-pool] Файл движка не найден: ${STOCKFISH_JS}. ` +
      `AI будет использовать случайные ходы. ` +
      `Убедитесь что пакет 'stockfish' установлен (npm install).`
    );
    return;
  }

  console.log(`[stockfish-pool] Запуск ${POOL_SIZE} дочерних процессов Stockfish...`);

  for (let i = 0; i < POOL_SIZE; i++) {
    try {
      const slot = spawnSlot(i);
      pool.push(slot);
      poolAvailable = true;
      // Сразу ставим idle-таймер — если никто не сыграет с AI за IDLE_TIMEOUT_MS, процесс освободит ОЗУ
      scheduleIdleKill(slot);
      console.log(`[stockfish-pool] Процесс #${i} запущен`);
    } catch (err: unknown) {
      console.warn(`[stockfish-pool] Не удалось запустить процесс #${i}:`, (err as Error)?.message ?? err);
    }
  }

  if (pool.length === 0) {
    console.warn("[stockfish-pool] Ни один процесс не запущен. AI использует случайные ходы.");
  } else {
    console.log(`[stockfish-pool] Пул готов: ${pool.length}/${POOL_SIZE} процессов`);
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
  if (!poolAvailable) {
    return Promise.reject(new Error("[stockfish-pool] Пул недоступен"));
  }

  return new Promise((resolve, reject) => {
    let slot = pool.find((s) => !s.busy && s.healthy);

    if (!slot && pool.length === 0) {
      // Пул пуст — процесс был убит по idle-таймеру. Создаём новый на лету.
      try {
        const newId = Date.now() % 10000; // условный id для логов
        console.log(`[stockfish-pool] Пересоздаём процесс Stockfish (on-demand, id=${newId})`);
        slot = spawnSlot(newId);
        pool.push(slot);
      } catch (err: unknown) {
        reject(new Error(`[stockfish-pool] Не удалось запустить процесс: ${(err as Error)?.message ?? err}`));
        return;
      }
    }

    if (!slot) {
      // Все слоты заняты — ставим в очередь
      queue.push({ fen, depth, skillLevel, resolve, reject });
      return;
    }

    executeOnSlot(slot, fen, depth, skillLevel, resolve, reject);
  });
}

function send(slot: EngineSlot, cmd: string): void {
  slot.proc.stdin!.write(cmd + "\n");
}

function executeOnSlot(
  slot: EngineSlot,
  fen: string,
  depth: number,
  skillLevel: number,
  resolve: (move: string) => void,
  reject: (err: Error) => void
): void {
  slot.busy = true;
  // Отменяем idle-таймер: процесс занят, убивать нельзя
  if (slot.idleTimer !== null) {
    clearTimeout(slot.idleTimer);
    slot.idleTimer = null;
  }

  // Таймаут: 30 сек для глубоких поисков (depth 20+), 10 сек для остальных
  const timeoutMs = depth >= 20 ? 30_000 : 10_000;
  let finished = false;

  const timeout = setTimeout(() => {
    if (finished) return;
    finished = true;
    slot.onLine = null;
    slot.busy = false;
    try { send(slot, "stop"); } catch {}
    reject(new Error(`[stockfish-pool] Slot #${slot.id} timeout`));
    // После освобождения слота — планируем idle-kill
    scheduleIdleKill(slot);
    drainQueue();
  }, timeoutMs);

  slot.onLine = (line: string) => {
    if (!line.startsWith("bestmove")) return;
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    slot.onLine = null;
    slot.busy = false;

    const parts = line.split(" ");
    const move = parts[1];
    if (move && move !== "(none)") {
      resolve(move);
    } else {
      reject(new Error("Stockfish вернул bestmove (none)"));
    }
    // После освобождения слота — планируем idle-kill
    scheduleIdleKill(slot);
    drainQueue();
  };

  send(slot, "ucinewgame");
  if (skillLevel < 20) {
    send(slot, "setoption name UCI_LimitStrength value true");
    send(slot, `setoption name Skill Level value ${skillLevel}`);
  } else {
    send(slot, "setoption name UCI_LimitStrength value false");
    send(slot, "setoption name Skill Level value 20");
  }
  send(slot, `position fen ${fen}`);
  send(slot, `go depth ${depth}`);
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
    pending?.reject(new Error("[stockfish-pool] Процесс недоступен"));
  }
}

/**
 * Завершает все дочерние процессы пула (для graceful shutdown).
 */
export async function shutdownStockfishPool(): Promise<void> {
  if (!poolAvailable) return;
  poolAvailable = false;
  for (const slot of pool) {
    // Отменяем idle-таймер перед принудительным завершением
    if (slot.idleTimer !== null) {
      clearTimeout(slot.idleTimer);
      slot.idleTimer = null;
    }
    try {
      slot.proc.kill();
    } catch {}
  }
  pool.length = 0;
  console.log("[stockfish-pool] Пул завершён");
}
