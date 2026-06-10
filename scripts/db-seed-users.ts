/**
 * scripts/db-seed-users.ts
 *
 * Создаёт двух тестовых пользователей:
 *   user1  — rating 400
 *   user2  — rating 3000
 *
 * Пароль для обоих: 12345678
 *
 * Только: users + accounts (пароль) + user_stats (рейтинг).
 * Никаких игр, достижений, истории и т.д.
 *
 * Запуск:
 *   npx tsx scripts/db-seed-users.ts
 */

import postgres from "postgres";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
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
  console.log("🔑  Хеширование пароля...\n");
  const passwordHash = await bcrypt.hash("12345678", 10);

  const userConfigs = [
    { username: "user1", email: "user1@test.local", name: "User One", rating: 400 },
    { username: "user2", email: "user2@test.local", name: "User Two", rating: 3000 },
  ];

  for (const cfg of userConfigs) {
    const username = cfg.username;
    const email = cfg.email;
    const name = cfg.name;
    const rating = cfg.rating;

    console.log("── " + username + " (rating " + rating + ") ──");

    try {
      // Проверяем, существует ли пользователь
      const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
      if (existing.length > 0) {
        console.log("  ⚠️  '" + username + "' уже существует — пропускаем.\n");
        continue;
      }

      // Генерируем friendCode и userId (Better-Auth использует nanoid)
      const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const friendCode = Array.from({ length: 8 }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join("");
      const userId = nanoid();

      // users
      await sql`
        INSERT INTO users (id, name, email, username, friend_code, is_online, created_at, updated_at)
        VALUES (${userId}, ${name}, ${email}, ${username}, ${friendCode}, false, NOW(), NOW())
      `;
      console.log("  ✅  users (id=" + userId + ")");

      // accounts — пароль
      const accountId = "local-" + userId;
      const provider = "email-password";
      await sql`
        INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
        VALUES (${accountId}, ${userId}, ${provider}, ${userId}, ${passwordHash}, NOW(), NOW())
      `;
      console.log("  ✅  accounts (provider=email-password)");

      // user_stats — рейтинг
      await sql`
        INSERT INTO user_stats (
          user_id, rating_rapid, rating_blitz, rating_bullet, rating_classical,
          games_played, games_won, games_lost, games_drawn, games_abandoned,
          current_win_streak, best_win_streak, current_daily_streak, best_daily_streak,
          puzzle_rating, puzzles_solved, ai_games_played, ai_games_won, updated_at
        )
        VALUES (
          ${userId}, ${rating}, ${rating}, ${rating}, ${rating},
          0, 0, 0, 0, 0,
          0, 0, 0, 0,
          1200, 0, 0, 0,
          NOW()
        )
      `;
      console.log("  ✅  user_stats (rating=" + rating + ")");

    } catch (err) {
      console.error("  ❌  Ошибка:", err);
    }

    console.log();
  }

  console.log("✅  Готово:");
  console.log("   user1 / 12345678  (rating 400)");
  console.log("   user2 / 12345678  (rating 3000)");

  await sql.end();
}

main().catch((err) => {
  console.error("❌  Критическая ошибка:", err);
  process.exit(1);
});
