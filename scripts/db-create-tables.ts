/**
 * scripts/db-create-tables.ts
 *
 * Создаёт ВСЕ таблицы базы данных по схеме Drizzle.
 * Подключается напрямую через pg (минуя Drizzle ORM),
 * чтобы обойти проблемы с db:push / drizzle-kit migrate.
 *
 * Запуск:
 *   npx tsx scripts/db-create-tables.ts
 */

import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Подключение ──────────────────────────────────────────────────────────────

function getDatabaseUrl(): string {
  // Читаем .env.local
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

// ── SQL: создание таблиц ───────────────────────────────────────────────────────

const CREATE_TABLES_SQL = `
-- ── ENUMS (создаём до таблиц, на которые они ссылаются) ──────────────────────

CREATE TYPE game_type AS ENUM ('rated', 'casual', 'ai', 'tournament', 'friendly');
CREATE TYPE game_result AS ENUM ('white_wins', 'black_wins', 'draw', 'abandoned', 'in_progress');
CREATE TYPE game_result_reason AS ENUM ('checkmate', 'resignation', 'timeout', 'stalemate', 'insufficient_material', 'threefold_repetition', 'fifty_move_rule', 'agreement', 'abandoned');
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'rejected', 'blocked');
CREATE TYPE achievement_category AS ENUM ('gameplay', 'social', 'milestone', 'special');
CREATE TYPE timing_category AS ENUM ('bullet', 'blitz', 'rapid', 'classical', 'correspondence');

-- ── USERS ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                        TEXT         PRIMARY KEY,
  name                      VARCHAR(100) NOT NULL,
  email                     VARCHAR(255) NOT NULL UNIQUE,
  email_verified            BOOLEAN      NOT NULL DEFAULT false,
  image                     TEXT,
  username                  VARCHAR(30)  UNIQUE,
  friend_code              VARCHAR(8)    NOT NULL UNIQUE,
  bio                       TEXT,
  country                   VARCHAR(2),
  is_online                 BOOLEAN      NOT NULL DEFAULT false,
  last_seen_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx      ON users (email);
CREATE INDEX IF NOT EXISTS users_username_idx  ON users (username);
CREATE INDEX IF NOT EXISTS users_is_online_idx ON users (is_online);

-- ── SESSIONS (Better-Auth) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT       PRIMARY KEY,
  expires_at  TIMESTAMPTZ NOT NULL,
  token       TEXT       NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address  TEXT,
  user_agent  TEXT,
  user_id     TEXT       NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_token_idx   ON sessions (token);

-- ── ACCOUNTS (Better-Auth) ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id                        TEXT       PRIMARY KEY,
  account_id                TEXT       NOT NULL,
  provider_id               TEXT       NOT NULL,
  user_id                   TEXT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token              TEXT,
  refresh_token            TEXT,
  id_token                  TEXT,
  access_token_expires_at  TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope                     TEXT,
  password                 TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_provider_account_unique
  ON accounts (provider_id, account_id);

-- ── VERIFICATIONS (Better-Auth) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS verifications (
  id          TEXT       PRIMARY KEY,
  identifier  TEXT       NOT NULL,
  value       TEXT       NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verifications_identifier_idx ON verifications (identifier);

-- ── USER STATS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_stats (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  rating_rapid          INTEGER     NOT NULL DEFAULT 1200,
  rating_blitz          INTEGER     NOT NULL DEFAULT 1200,
  rating_bullet         INTEGER     NOT NULL DEFAULT 1200,
  rating_classical      INTEGER     NOT NULL DEFAULT 1200,
  games_played          INTEGER     NOT NULL DEFAULT 0,
  games_won             INTEGER     NOT NULL DEFAULT 0,
  games_lost            INTEGER     NOT NULL DEFAULT 0,
  games_drawn           INTEGER     NOT NULL DEFAULT 0,
  games_abandoned       INTEGER     NOT NULL DEFAULT 0,
  current_win_streak    INTEGER     NOT NULL DEFAULT 0,
  best_win_streak       INTEGER     NOT NULL DEFAULT 0,
  current_daily_streak  INTEGER     NOT NULL DEFAULT 0,
  best_daily_streak     INTEGER     NOT NULL DEFAULT 0,
  puzzle_rating         INTEGER     NOT NULL DEFAULT 1200,
  puzzles_solved       INTEGER     NOT NULL DEFAULT 0,
  ai_games_played      INTEGER     NOT NULL DEFAULT 0,
  ai_games_won         INTEGER     NOT NULL DEFAULT 0,
  last_game_at          TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_stats_rating_rapid_idx  ON user_stats (rating_rapid);
CREATE INDEX IF NOT EXISTS user_stats_rating_blitz_idx  ON user_stats (rating_blitz);
CREATE INDEX IF NOT EXISTS user_stats_rating_bullet_idx ON user_stats (rating_bullet);

-- ── FRIENDSHIPS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS friendships (
  id            UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  TEXT               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id  TEXT               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        friendship_status  NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_unique ON friendships (requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS friendships_requester_idx     ON friendships (requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx      ON friendships (addressee_id);
CREATE INDEX IF NOT EXISTS friendships_status_idx         ON friendships (status);

-- ── GAMES ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS games (
  id                     UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  white_player_id        TEXT                REFERENCES users(id) ON DELETE SET NULL,
  black_player_id        TEXT                REFERENCES users(id) ON DELETE SET NULL,
  is_ai_game             BOOLEAN            NOT NULL DEFAULT false,
  ai_difficulty          SMALLINT,
  ai_color               VARCHAR(5),
  game_type              game_type          NOT NULL DEFAULT 'casual',
  timing_category        timing_category    NOT NULL DEFAULT 'rapid',
  time_control_minutes   SMALLINT           NOT NULL DEFAULT 10,
  increment_seconds      SMALLINT           NOT NULL DEFAULT 0,
  result                 game_result        NOT NULL DEFAULT 'in_progress',
  result_reason          game_result_reason,
  status                 VARCHAR(20)        NOT NULL DEFAULT 'waiting',
  pgn                    TEXT,
  final_fen              TEXT,
  opening_name           VARCHAR(100),
  opening_eco            VARCHAR(5),
  white_time_remaining_ms INTEGER,
  black_time_remaining_ms INTEGER,
  total_moves            SMALLINT           NOT NULL DEFAULT 0,
  white_rating_before    INTEGER,
  black_rating_before    INTEGER,
  white_rating_after     INTEGER,
  black_rating_after     INTEGER,
  peak_spectators        SMALLINT           NOT NULL DEFAULT 0,
  draw_offered_by        VARCHAR(5),
  started_at             TIMESTAMPTZ,
  ended_at               TIMESTAMPTZ,
  created_at             TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS games_white_player_idx         ON games (white_player_id);
CREATE INDEX IF NOT EXISTS games_black_player_idx         ON games (black_player_id);
CREATE INDEX IF NOT EXISTS games_status_idx               ON games (status);
CREATE INDEX IF NOT EXISTS games_result_idx               ON games (result);
CREATE INDEX IF NOT EXISTS games_game_type_idx            ON games (game_type);
CREATE INDEX IF NOT EXISTS games_timing_category_idx     ON games (timing_category);
CREATE INDEX IF NOT EXISTS games_created_at_idx          ON games (created_at);
CREATE INDEX IF NOT EXISTS games_status_created_at_idx   ON games (status, created_at);

-- ── RATING HISTORY (после games — есть FK на games) ───────────────────────────

CREATE TABLE IF NOT EXISTS rating_history (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id          UUID             REFERENCES games(id) ON DELETE SET NULL,
  timing_category  timing_category   NOT NULL,
  rating_before    INTEGER          NOT NULL,
  rating_after     INTEGER          NOT NULL,
  rating_change    INTEGER          NOT NULL,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rating_history_user_id_idx       ON rating_history (user_id);
CREATE INDEX IF NOT EXISTS rating_history_user_timing_idx  ON rating_history (user_id, timing_category);
CREATE INDEX IF NOT EXISTS rating_history_created_at_idx   ON rating_history (created_at);

-- ── GAME MOVES ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS game_moves (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             UUID        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number         SMALLINT    NOT NULL,
  color               VARCHAR(5)  NOT NULL,
  san                 VARCHAR(10) NOT NULL,
  uci                 VARCHAR(5)  NOT NULL,
  fen                 TEXT        NOT NULL,
  time_spent_ms       INTEGER,
  clock_remaining_ms  INTEGER,
  eval_cp             INTEGER,
  eval_depth          SMALLINT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS game_moves_game_id_idx         ON game_moves (game_id);
CREATE INDEX IF NOT EXISTS game_moves_game_move_number_idx ON game_moves (game_id, move_number);
CREATE UNIQUE INDEX IF NOT EXISTS game_moves_game_move_color_unique
  ON game_moves (game_id, move_number, color);

-- ── ACHIEVEMENTS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS achievements (
  id          VARCHAR(50)           PRIMARY KEY,
  name        VARCHAR(100)          NOT NULL,
  description TEXT                  NOT NULL,
  category    achievement_category  NOT NULL,
  icon_url    TEXT,
  points      SMALLINT              NOT NULL DEFAULT 10,
  is_secret   BOOLEAN              NOT NULL DEFAULT false,
  criteria    TEXT                  NOT NULL,
  created_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS achievements_category_idx ON achievements (category);

-- ── USER ACHIEVEMENTS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_achievements (
  id             UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id VARCHAR(50) NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  game_id        UUID      REFERENCES games(id) ON DELETE SET NULL,
  earned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_achievements_unique  ON user_achievements (user_id, achievement_id);
CREATE INDEX IF NOT EXISTS user_achievements_user_id_idx   ON user_achievements (user_id);
CREATE INDEX IF NOT EXISTS user_achievements_earned_at_idx ON user_achievements (earned_at);

-- ── PLAYER GAME STATS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS player_game_stats (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                UUID        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id                TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  color                  VARCHAR(5)  NOT NULL,
  accuracy_percent       REAL,
  blunders               SMALLINT    NOT NULL DEFAULT 0,
  mistakes               SMALLINT    NOT NULL DEFAULT 0,
  inaccuracies           SMALLINT    NOT NULL DEFAULT 0,
  brilliant_moves        SMALLINT    NOT NULL DEFAULT 0,
  good_moves             SMALLINT    NOT NULL DEFAULT 0,
  avg_move_time_ms       INTEGER,
  longest_move_time_ms   INTEGER,
  time_used_percent      REAL,
  material_advantage_at_end SMALLINT,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS player_game_stats_unique ON player_game_stats (game_id, user_id);
CREATE INDEX IF NOT EXISTS player_game_stats_user_id_idx  ON player_game_stats (user_id);
CREATE INDEX IF NOT EXISTS player_game_stats_game_id_idx  ON player_game_stats (game_id);

-- ── USER DAILY STATS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_daily_stats (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            VARCHAR(10) NOT NULL,
  games_played    SMALLINT    NOT NULL DEFAULT 0,
  games_won       SMALLINT    NOT NULL DEFAULT 0,
  games_lost      SMALLINT    NOT NULL DEFAULT 0,
  games_drawn     SMALLINT    NOT NULL DEFAULT 0,
  rating_change   INTEGER     NOT NULL DEFAULT 0,
  time_played_ms  INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_daily_stats_unique ON user_daily_stats (user_id, date);
CREATE INDEX IF NOT EXISTS user_daily_stats_user_id_idx   ON user_daily_stats (user_id);
CREATE INDEX IF NOT EXISTS user_daily_stats_date_idx     ON user_daily_stats (date);
`;

// ── MAIN ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔧  Создание таблиц в БД...\n");

  try {
    await sql.unsafe(CREATE_TABLES_SQL);
    console.log("✅  Все таблицы успешно созданы (или уже существуют).");
  } catch (err) {
    console.error("❌  Ошибка при создании таблиц:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
