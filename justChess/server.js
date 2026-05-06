// Load environment variables
require("dotenv").config({ path: ".env.local" });
const { validateEnv } = require("./src/lib/env");
validateEnv();

// Custom Node.js server integrating Next.js + Socket.IO
// This is required because Next.js API routes don't support WebSocket upgrades natively.
// Run with: npx tsx server.js  (tsx transpiles TypeScript require() on the fly)

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { registerSocketHandlers } = require("./src/server/socket/index");
const { setIO } = require("./src/server/socket/io-instance");
const { initStockfishPool, shutdownStockfishPool } = require("./src/server/stockfish/stockfish-pool");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Инициализируем пул Stockfish worker_threads
  initStockfishPool();
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  // Initialize Socket.IO
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Use polling as fallback for serverless-like environments
    transports: ["websocket", "polling"],
    // Ping timeout/interval for connection health
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Register all Socket.IO event handlers
  registerSocketHandlers(io);

  // Регистрируем io через явный синглтон вместо global.io
  setIO(io);

  process.on("SIGTERM", async () => {
    await shutdownStockfishPool();
    process.exit(0);
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(
        `> Ready on http://${hostname}:${port} [${dev ? "development" : "production"}]`
      );
    });
});
