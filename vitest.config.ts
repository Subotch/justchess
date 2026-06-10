import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
include: [
        "src/lib/elo.ts",
        "src/lib/chess-engine.ts",
        "src/services/game.service.ts",
        "src/server/socket/handlers/**",
        "src/server/socket/clock-manager.ts",
        "src/server/socket/matchmaking.ts",
        "src/server/socket/queue.ts",
        "src/server/stockfish/stockfish-pool.ts",
        "src/server/socket/middleware/rate-limit.middleware.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
