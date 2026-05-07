/**
 * Singleton pino logger for server-side code.
 */

import pino from "pino";

export const logger = pino({
  name: "justchess",
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});
