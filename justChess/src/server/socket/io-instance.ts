/**
 * io-instance.ts — явный синглтон Socket.IO сервера.
 * Используйте setIO() при инициализации в server.js,
 * getIO() — в API routes и сервисах.
 */

import type { AppServer } from "./index";

let _io: AppServer | null = null;

export function setIO(io: AppServer): void {
  _io = io;
}

export function getIO(): AppServer {
  if (!_io) {
    throw new Error(
      "[io-instance] Socket.IO не инициализирован. Убедитесь что setIO() вызван в server.js до использования getIO()."
    );
  }
  return _io;
}
