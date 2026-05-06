/**
 * Stockfish Worker Thread — серверный AI движок.
 * Запускается внутри worker_threads пула (stockfish-pool.ts).
 * Использует npm-пакет `stockfish` (Node.js совместимый).
 * Компилируется в CommonJS через tsconfig.server.json.
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

const engine = Stockfish();

engine.onmessage = (line: string) => {
  if (line.startsWith("bestmove")) {
    const parts = line.split(" ");
    const move = parts[1];
    if (move && move !== "(none)") {
      const response: WorkerResponse = { type: "bestmove", move };
      parentPort?.postMessage(response);
    }
  }
};

engine.postMessage("uci");
engine.postMessage("isready");

parentPort?.on("message", ({ fen, depth, skillLevel }: WorkerRequest) => {
  console.log(`[stockfish-worker] Request: skillLevel=${skillLevel}, depth=${depth}, fen=${fen.slice(0, 30)}...`);
  engine.postMessage("ucinewgame");
  // UCI_LimitStrength must be enabled for Skill Level to take effect
  if (skillLevel < 20) {
    engine.postMessage("setoption name UCI_LimitStrength value true");
    engine.postMessage(`setoption name Skill Level value ${skillLevel}`);
  } else {
    // Maximum strength: disable limiter
    engine.postMessage("setoption name UCI_LimitStrength value false");
    engine.postMessage("setoption name Skill Level value 20");
  }
  engine.postMessage(`position fen ${fen}`);
  engine.postMessage(`go depth ${depth}`);
});
