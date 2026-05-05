/**
 * Stockfish Worker Thread — серверный AI движок.
 * Запускается внутри worker_threads пула (stockfish-pool.ts).
 * Использует npm-пакет `stockfish` (Node.js совместимый).
 */

import { parentPort } from "worker_threads";
import { createRequire } from "module";

// createRequire позволяет использовать require() в ESM / tsx-окружении
const require = createRequire(import.meta.url);
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
  engine.postMessage("ucinewgame");
  engine.postMessage(`setoption name Skill Level value ${skillLevel}`);
  engine.postMessage(`position fen ${fen}`);
  engine.postMessage(`go depth ${depth}`);
});
