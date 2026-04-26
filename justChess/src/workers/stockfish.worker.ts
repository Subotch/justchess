/**
 * Stockfish Web Worker
 *
 * Runs Stockfish WASM in a dedicated worker thread to avoid blocking the UI.
 * Communication protocol: UCI (Universal Chess Interface)
 *
 * Usage from main thread:
 *   const worker = new Worker(new URL('./stockfish.worker.ts', import.meta.url));
 *   worker.postMessage({ type: 'init' });
 *   worker.postMessage({ type: 'analyze', fen: '...', depth: 15, skillLevel: 10 });
 *   worker.onmessage = (e) => { ... }
 */

// Stockfish WASM is loaded via CDN or local file
// In production, copy stockfish.js to /public/stockfish/
declare const Stockfish: () => Promise<any>;

interface WorkerMessage {
  type: "init" | "analyze" | "bestmove" | "stop" | "quit";
  fen?: string;
  depth?: number;
  skillLevel?: number;
  multiPv?: number;
  moveTime?: number; // ms to think
}

interface WorkerResponse {
  type: "ready" | "bestmove" | "info" | "error";
  bestMove?: string;
  ponder?: string;
  score?: { type: "cp" | "mate"; value: number };
  depth?: number;
  pv?: string[];
  error?: string;
}

let engine: any = null;
let isReady = false;

// ─────────────────────────────────────────────
// INITIALIZE STOCKFISH
// ─────────────────────────────────────────────

async function initEngine(): Promise<void> {
  try {
    // Load Stockfish WASM
    importScripts("/stockfish/stockfish.js");
    engine = await (self as any).Stockfish();

    engine.addMessageListener((line: string) => {
      handleEngineOutput(line);
    });

    // Initialize UCI
    engine.postMessage("uci");
    engine.postMessage("isready");
  } catch (err) {
    postMessage({ type: "error", error: String(err) } as WorkerResponse);
  }
}

// ─────────────────────────────────────────────
// HANDLE ENGINE OUTPUT
// ─────────────────────────────────────────────

function handleEngineOutput(line: string): void {
  if (line === "uciok") {
    // UCI initialized
    return;
  }

  if (line === "readyok") {
    isReady = true;
    postMessage({ type: "ready" } as WorkerResponse);
    return;
  }

  // Parse bestmove
  if (line.startsWith("bestmove")) {
    const parts = line.split(" ");
    const bestMove = parts[1];
    const ponder = parts[3]; // after "ponder"

    postMessage({
      type: "bestmove",
      bestMove: bestMove === "(none)" ? undefined : bestMove,
      ponder,
    } as WorkerResponse);
    return;
  }

  // Parse info lines (evaluation)
  if (line.startsWith("info") && line.includes("score")) {
    const depthMatch = line.match(/depth (\d+)/);
    const cpMatch = line.match(/score cp (-?\d+)/);
    const mateMatch = line.match(/score mate (-?\d+)/);
    const pvMatch = line.match(/ pv (.+)/);

    const depth = depthMatch ? parseInt(depthMatch[1]) : 0;
    const pv = pvMatch ? pvMatch[1].trim().split(" ") : [];

    let score: { type: "cp" | "mate"; value: number } | undefined;
    if (cpMatch) score = { type: "cp", value: parseInt(cpMatch[1]) };
    if (mateMatch) score = { type: "mate", value: parseInt(mateMatch[1]) };

    postMessage({ type: "info", depth, score, pv } as WorkerResponse);
  }
}

// ─────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, fen, depth, skillLevel, multiPv, moveTime } = event.data;

  switch (type) {
    case "init":
      await initEngine();
      break;

    case "analyze":
      if (!engine || !isReady || !fen) return;

      // Configure engine
      engine.postMessage(`setoption name Skill Level value ${skillLevel ?? 20}`);
      engine.postMessage(`setoption name MultiPV value ${multiPv ?? 1}`);
      engine.postMessage("ucinewgame");
      engine.postMessage(`position fen ${fen}`);

      if (moveTime) {
        engine.postMessage(`go movetime ${moveTime}`);
      } else {
        engine.postMessage(`go depth ${depth ?? 15}`);
      }
      break;

    case "bestmove":
      // Request best move with time limit (for AI games)
      if (!engine || !isReady || !fen) return;
      engine.postMessage(`setoption name Skill Level value ${skillLevel ?? 10}`);
      engine.postMessage("ucinewgame");
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage(`go movetime ${moveTime ?? 1000}`);
      break;

    case "stop":
      if (engine) engine.postMessage("stop");
      break;

    case "quit":
      if (engine) engine.postMessage("quit");
      engine = null;
      isReady = false;
      break;
  }
};
