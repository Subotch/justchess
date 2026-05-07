/**
 * Stockfish Worker Thread — серверный AI движок.
 * Запускается внутри worker_threads пула (stockfish-pool.ts).
 * Использует npm-пакет `stockfish` v18 (Node.js совместимый).
 * Компилируется в CommonJS через tsconfig.worker.json.
 *
 * ВАЖНО: stockfish@18 возвращает engine через Promise (не синхронно).
 * После resolve у объекта есть:
 *   engine.sendCommand(cmd: string) — отправить команду движку
 *   engine.onmessage = (line: string) => void — получать ответы
 */

import { parentPort } from "worker_threads";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Stockfish = require("stockfish");

interface WorkerRequest {
  fen: string;
  depth: number;
  skillLevel: number;
}

interface WorkerResponse {
  type: "bestmove" | "error";
  move?: string;
  error?: string;
}

let engine: any = null;
let engineReady = false;

// Очередь запросов, пришедших до инициализации движка
const pendingRequests: WorkerRequest[] = [];

function handleRequest(req: WorkerRequest): void {
  console.log(`[stockfish-worker] Request: skillLevel=${req.skillLevel}, depth=${req.depth}, fen=${req.fen.slice(0, 30)}...`);
  engine.sendCommand("ucinewgame");
  // UCI_LimitStrength must be enabled for Skill Level to take effect
  if (req.skillLevel < 20) {
    engine.sendCommand("setoption name UCI_LimitStrength value true");
    engine.sendCommand(`setoption name Skill Level value ${req.skillLevel}`);
  } else {
    // Maximum strength: disable limiter
    engine.sendCommand("setoption name UCI_LimitStrength value false");
    engine.sendCommand("setoption name Skill Level value 20");
  }
  engine.sendCommand(`position fen ${req.fen}`);
  engine.sendCommand(`go depth ${req.depth}`);
}

// "single" — single-threaded WASM, не требует SharedArrayBuffer, работает в worker_threads
Stockfish("single").then((sf: any) => {
  engine = sf;

  engine.onmessage = (line: string) => {
    if (typeof line !== "string") return;
    if (line.startsWith("bestmove")) {
      const parts = line.split(" ");
      const move = parts[1];
      if (move && move !== "(none)") {
        const response: WorkerResponse = { type: "bestmove", move };
        parentPort?.postMessage(response);
      } else {
        // Stockfish вернул (none) — мат/пат или нет ходов
        const response: WorkerResponse = { type: "error", error: "bestmove (none) — no legal moves" };
        parentPort?.postMessage(response);
      }
    }
  };

  engine.sendCommand("uci");
  engine.sendCommand("isready");

  engineReady = true;
  console.log("[stockfish-worker] Engine ready");

  // Обрабатываем накопленные запросы
  for (const req of pendingRequests) {
    handleRequest(req);
  }
  pendingRequests.length = 0;
}).catch((err: unknown) => {
  console.error("[stockfish-worker] Failed to initialize Stockfish:", err);
  const response: WorkerResponse = { type: "error", error: "Failed to initialize Stockfish engine" };
  parentPort?.postMessage(response);
  process.exit(1);
});

parentPort?.on("message", (req: WorkerRequest) => {
  if (!engineReady || !engine) {
    // Движок ещё инициализируется — складываем в очередь
    pendingRequests.push(req);
    return;
  }
  handleRequest(req);
});
