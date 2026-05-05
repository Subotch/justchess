import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// В контексте Next.js (не server.js) validateEnv() не вызывается заранее,
// поэтому делаем простую проверку переменной прямо здесь.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "[db] DATABASE_URL не задан. Убедитесь что .env.local содержит DATABASE_URL."
  );
}

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });

export type DB = typeof db;
