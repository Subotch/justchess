/**
 * env.ts — валидация переменных окружения через Zod.
 * Вызывается первым делом в server.js после dotenv.config().
 * При ошибке — process.exit(1) с читаемым выводом.
 */

import { z } from "zod";

const envSchema = z.object({
  // Runtime
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOSTNAME: z.string().default("0.0.0.0"),

  // Database (PostgreSQL)
  DATABASE_URL: z.string().url("DATABASE_URL должен быть валидным URL"),

  // Better-Auth
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET должен быть минимум 32 символа"),
  BETTER_AUTH_URL: z.string().url("BETTER_AUTH_URL должен быть валидным URL"),

  // Public app URL (используется в CORS и Socket.IO)
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL должен быть валидным URL")
    .default("http://localhost:3000"),

  // Redis (опционально — при отсутствии rate-limiter работает in-memory)
  REDIS_URL: z.string().url("REDIS_URL должен быть валидным URL").optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

/**
 * Валидирует process.env и кэширует результат.
 * Вызывать один раз при старте приложения (server.js).
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      "\n❌ [env] Ошибка конфигурации — неверные переменные окружения:\n"
    );
    for (const [field, issues] of Object.entries(
      result.error.flatten().fieldErrors
    )) {
      console.error(`  • ${field}: ${(issues as string[]).join(", ")}`);
    }
    console.error("\nПроверьте файл .env.local и перезапустите сервер.\n");
    process.exit(1);
  }

  _env = result.data;
  return _env;
}

/**
 * Возвращает кэшированный объект env.
 * Бросает ошибку если validateEnv() ещё не вызывался.
 */
export function env(): Env {
  if (!_env) {
    throw new Error(
      "[env] env() вызван до validateEnv(). Убедитесь что validateEnv() вызван в server.js."
    );
  }
  return _env;
}
