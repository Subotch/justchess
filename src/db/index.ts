import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// В контексте Next.js (не server.js) validateEnv() не вызывается заранее,
// поэтому делаем простую проверку переменной прямо здесь.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "[db] DATABASE_URL не задан. Убедитесь что .env.local содержит DATABASE_URL."
  );
}

const sql = postgres(process.env.DATABASE_URL!, { max: 10 });

export const db = drizzle(sql, { schema });

export type DB = typeof db;
