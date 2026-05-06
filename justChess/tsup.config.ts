import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/server/stockfish/stockfish-worker.ts",
    "src/server/socket/index.ts",
    "src/server/socket/io-instance.ts",
    "src/server/stockfish/stockfish-pool.ts",
  ],
  outDir: "dist",
  format: ["cjs"],
  target: "node18",
  platform: "node",
  bundle: true,
  sourcemap: false,
  clean: true,
  // Resolve path aliases (@/* → src/*)
  tsconfig: "tsconfig.server.json",
  // Не бандлить node_modules (они доступны в prod)
  noExternal: [],
  external: [
    // Node built-ins
    "worker_threads", "os", "path", "fs", "http", "url",
    "crypto", "events", "stream", "buffer", "util",
    // npm deps
    "next", "socket.io", "socket.io-client", "pino", "pino-pretty",
    "better-auth", "drizzle-orm", "pg", "@neondatabase/serverless",
    "ioredis", "redis", "rate-limiter-flexible", "chess.js",
    "nanoid", "zod", "dotenv", "bcryptjs", "stockfish",
  ],
  esbuildOptions(options) {
    options.alias = {
      "@": "./src",
    };
  },
});
