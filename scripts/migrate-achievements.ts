/**
 * Миграция: добавляет отсутствующие достижения из ACHIEVEMENT_DEFINITIONS
 * в БД. Запуск: npx tsx scripts/migrate-achievements.ts
 *
 * Требует DATABASE_URL в .env или .env.local
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { achievements } from "../src/db/schema";
import { ACHIEVEMENT_DEFINITIONS } from "../src/services/achievement.service";

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL не задан");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 5 });
const db = drizzle(sql);

async function main() {
  console.log("🔧  Проверяем достижения в базе...\n");

  const existing = await db.select({ id: achievements.id }).from(achievements);
  const existingIds = new Set(existing.map((a) => a.id));

  let inserted = 0;
  let skipped = 0;

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (existingIds.has(def.id)) {
      console.log(`  ⏭   ${def.name} (${def.id}) — уже есть`);
      skipped++;
      continue;
    }

    try {
      await db
        .insert(achievements)
        .values({
          id: def.id,
          name: def.name,
          description: def.description,
          category: def.category,
          points: def.points,
          isSecret: def.isSecret,
          criteria: def.criteria,
        })
        .onConflictDoNothing();

      console.log(`  ✅  ${def.name} (${def.id}) — добавлен`);
      inserted++;
    } catch (err) {
      console.error(`  ❌  Ошибка при вставке ${def.id}:`, err);
      skipped++;
    }
  }

  console.log(`\n✔  Готово: добавлено ${inserted}, пропущено ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
