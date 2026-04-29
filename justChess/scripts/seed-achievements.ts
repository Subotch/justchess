/**
 * Временный скрипт для загрузки 10 достижений в БД.
 * Запуск: npx tsx scripts/seed-achievements.ts
 *
 * Требует переменной окружения DATABASE_URL (файл .env или .env.local)
 */

import { config } from "dotenv";
import { resolve } from "path";

// Загружаем .env.local затем .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { achievements } from "../src/db/schema";

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL не задан");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const NEW_ACHIEVEMENTS = [
  {
    id: "first_blood",
    name: "Первая кровь",
    description: "Выиграйте свою самую первую партию в рейтинговом режиме",
    category: "gameplay" as const,
    points: 15,
    isSecret: false,
    criteria: JSON.stringify({ type: "wins", count: 1, gameType: "rated" }),
  },
  {
    id: "newcomer_1300",
    name: "Новичок",
    description: "Достигните рейтинга 1300 ELO",
    category: "milestone" as const,
    points: 15,
    isSecret: false,
    criteria: JSON.stringify({ type: "rating", value: 1300 }),
  },
  {
    id: "illusion_breaker",
    name: "Разрушитель иллюзий",
    description: "Победите или сыграйте вничью с соперником, чей рейтинг выше вашего на 400+ очков",
    category: "special" as const,
    points: 40,
    isSecret: false,
    criteria: JSON.stringify({ type: "upset_result", ratingDiff: 400 }),
  },
  {
    id: "kaissa_favorite",
    name: "Любимец Каиссы",
    description: "Достигните рейтинга 1600 ELO",
    category: "milestone" as const,
    points: 30,
    isSecret: false,
    criteria: JSON.stringify({ type: "rating", value: 1600 }),
  },
  {
    id: "blitzkrieg",
    name: "Блицкриг",
    description: "Поставьте мат сопернику с рейтингом 1400+ менее чем за 15 ходов",
    category: "gameplay" as const,
    points: 35,
    isSecret: false,
    criteria: JSON.stringify({ type: "quick_checkmate", opponentRating: 1400, maxMoves: 15 }),
  },
  {
    id: "steel_wall",
    name: "Стальная стена",
    description: "Победите соперника с рейтингом 1500+, не потеряв ни одной фигуры (кроме пешек)",
    category: "special" as const,
    points: 50,
    isSecret: false,
    criteria: JSON.stringify({ type: "no_piece_loss_win", opponentRating: 1500 }),
  },
  {
    id: "queen_hunter",
    name: "Охотник за ферзями",
    description: "Выиграйте партию, забрав вражеского ферзя при сохранении своего",
    category: "gameplay" as const,
    points: 25,
    isSecret: false,
    criteria: JSON.stringify({ type: "queen_capture_win" }),
  },
  {
    id: "candidate_master",
    name: "Кандидат в мастера",
    description: "Достигните рейтинга 1900 ELO",
    category: "milestone" as const,
    points: 75,
    isSecret: false,
    criteria: JSON.stringify({ type: "rating", value: 1900 }),
  },
  {
    id: "in_zeitnot",
    name: "В цейтноте",
    description: "Выиграйте партию у соперника 1700+, имея менее 30 секунд против 2+ минут у противника",
    category: "special" as const,
    points: 60,
    isSecret: false,
    criteria: JSON.stringify({ type: "zeitnot_win", opponentRating: 1700, ownTimeMs: 30000, opponentTimeMs: 120000 }),
  },
  {
    id: "morphys_legacy",
    name: "Наследие Морфи",
    description: "Достигните рейтинга 2200+ ELO",
    category: "milestone" as const,
    points: 200,
    isSecret: true,
    criteria: JSON.stringify({ type: "rating", value: 2200 }),
  },
] as const;

async function main() {
  console.log("🌱  Загружаем 10 достижений в базу данных...\n");

  let inserted = 0;
  let skipped = 0;

  for (const ach of NEW_ACHIEVEMENTS) {
    try {
      await db
        .insert(achievements)
        .values(ach)
        .onConflictDoNothing();
      console.log(`  ✅  ${ach.name} (${ach.id})`);
      inserted++;
    } catch (err) {
      console.error(`  ❌  Ошибка при вставке ${ach.id}:`, err);
      skipped++;
    }
  }

  console.log(`\n✔  Готово: вставлено ${inserted}, пропущено/ошибок ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
