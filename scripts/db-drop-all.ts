/**
 * scripts/db-drop-all.ts
 *
 * Удаляет ВСЕ таблицы, последовательности, типы и данные из БД.
 * Выполняет DROP CASCADE для гарантированного удаления всех зависимостей.
 *
 * Запуск:
 *   npx tsx scripts/db-drop-all.ts
 */

import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Подключение ──────────────────────────────────────────────────────────────

function getDatabaseUrl(): string {
  const envPath = resolve(".env.local");
  const envContent = readFileSync(envPath, "utf-8");
  const match = envContent.match(/^DATABASE_URL="(.+)"$/m);
  if (!match) {
    throw new Error("DATABASE_URL не найден в .env.local");
  }
  return match[1];
}

const DATABASE_URL = getDatabaseUrl();
const sql = postgres(DATABASE_URL, { max: 1 });

// ── MAIN ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("⚠️   Удаление ВСЕХ объектов из базы данных...\n");

  try {
    // 1. Отключаем все активные сессии (кроме текущей) — на случай, если
    //    кто-то подключён извне. Это предотвращает блокировку DROP.
    await sql.unsafe(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid();
    `);

    // 2. Удаляем все таблицы, представления, materialized views,
    //    последовательности и типы в текущей схеме (public).
    await sql.unsafe(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        -- Удаляем cascade все foreign key в таблицах
        FOR r IN (
          SELECT tablename
          FROM   pg_tables
          WHERE  schemaname = 'public'
        ) LOOP
          EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.tablename);
        END LOOP;

        -- Удаляем представления
        FOR r IN (
          SELECT viewname
          FROM   pg_views
          WHERE  schemaname = 'public'
        ) LOOP
          EXECUTE format('DROP VIEW IF EXISTS %I CASCADE', r.viewname);
        END LOOP;

        -- Удаляем materialized views
        FOR r IN (
          SELECT matviewname
          FROM   pg_matviews
          WHERE  schemaname = 'public'
        ) LOOP
          EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS %I CASCADE', r.matviewname);
        END LOOP;

        -- Удаляем последовательности
        FOR r IN (
          SELECT sequence_name
          FROM   information_schema.sequences
          WHERE  sequence_schema = 'public'
        ) LOOP
          EXECUTE format('DROP SEQUENCE IF EXISTS %I CASCADE', r.sequence_name);
        END LOOP;

        -- Удаляем enum-типы
        FOR r IN (
          SELECT typname
          FROM   pg_type t
          JOIN   pg_namespace n ON n.oid = t.typnamespace
          WHERE  n.nspname = 'public'
            AND  t.typtype = 'e'
        ) LOOP
          EXECUTE format('DROP TYPE IF EXISTS %I CASCADE', r.typname);
        END LOOP;
      END;
      $$;
    `);

    console.log("✅  Все таблицы, представления, последовательности и типы удалены.");
  } catch (err) {
    console.error("❌  Ошибка при удалении:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();