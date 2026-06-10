# JustChess — Техническая документация

---

## 1. Структура проекта

```
justchess/
├── app/                          # Next.js App Router (страницы)
│   ├── api/                      # REST API (Next.js API Routes)
│   │   ├── achievements/         # Достижения
│   │   ├── ai/                    # Создание игры против ИИ
│   │   ├── auth/                 # Better-Auth: вход, выход, OAuth
│   │   ├── friends/              # Друзья: заявки, принятие, удаление
│   │   ├── games/                # Игры: CRUD, ходы, ничья, сдача, PGN
│   │   ├── leaderboard/          # Рейтинговая таблица
│   │   └── users/               # Профиль, статистика, история рейтинга, поиск
│   ├── auth/                     # Страницы входа и регистрации
│   ├── friends/                  # Страница друзей
│   ├── game/[id]/               # Живая игра + разбор партии
│   ├── leaderboard/             # Страница рейтинга
│   ├── play/                    # Меню игры: очередь или ИИ
│   └── profile/[id]/           # Профиль игрока + история партий
├── src/
│   ├── components/              # React-компоненты (chess, game, profile, ui)
│   ├── db/
│   │   └── schema.ts            # Drizzle ORM: все таблицы и связи
│   ├── hooks/                   # Кастомные React hooks (useSocket и т.д.)
│   ├── lib/                     # Утилиты общего назначения
│   │   ├── auth.ts             # Конфигурация Better-Auth
│   │   ├── auth-client.ts       # Клиентские хелперы авторизации
│   │   ├── chess-engine.ts      # chess.js обёртка + FEN/PGN утилиты
│   │   ├── elo.ts               # Расчёт рейтинга (вариант Glicko-2)
│   │   ├── env.ts               # Валидация переменных окружения (Zod)
│   │   ├── i18n/                # Интернационализация
│   │   ├── rate-limit.ts        # HTTP rate limiter (in-memory / Redis)
│   │   └── api-response.ts       # Стандартный формат ответа API
│   ├── server/
│   │   ├── logger.ts            # Pino — структурированные JSON-логи
│   │   ├── socket/              # Socket.IO сервер
│   │   │   ├── index.ts         # registerSocketHandlers() — точка входа
│   │   │   ├── io-instance.ts   # Синглтон для доступа к io извне
│   │   │   ├── clock-manager.ts # Серверные шахматные часы
│   │   │   ├── queue.ts         # AsyncQueue — сериализация операций по gameId
│   │   │   ├── matchmaking.ts   # Очередь подбора игроков (in-memory)
│   │   │   ├── handlers/
│   │   │   │   ├── game.handler.ts       # Ходы, сдача, ничья, чат
│   │   │   │   ├── lobby.handler.ts     # Подбор, вызов друзей
│   │   │   │   └── spectator.handler.ts  # Наблюдение за игрой
│   │   │   └── middleware/
│   │   │       ├── auth.middleware.ts          # Валидация сессии Better-Auth
│   │   │       └── rate-limit.middleware.ts   # Защита от спама событий
│   │   └── stockfish/
│   │       └── stockfish-pool.ts  # Пул дочерних процессов Stockfish (UCI)
│   ├── services/
│   │   ├── game.service.ts       # Ядро игровой логики
│   │   └── achievement.service.ts # Проверка и начисление достижений
│   ├── stores/                   # Zustand-сторе (game, lobby, user, notification)
│   └── types/
│       ├── api.ts                # Типы ответов API
│       ├── game.ts               # Общие типы (GameState, ChessMove, уровни ИИ)
│       └── socket.ts             # Типы событий Socket.IO
├── server.js                    # Кастомный HTTP-сервер (Next.js + Socket.IO)
├── drizzle.config.ts            # Конфигурация Drizzle Kit
├── vitest.config.ts             # Конфигурация Vitest
├── eslint.config.mjs            # Конфигурация ESLint
└── package.json
```

---

## 2. Ключевые архитектурные решения

### 2.1. Почему кастомный сервер (`server.js`), а не стандартный Next.js
Next.js API Routes работают по модели HTTP request/response. WebSocket — это постоянный двунаправленный канал, и Next.js не поддерживает Upgrade-запросы для WebSocket. Шахматы — это игра реального времени: тики часов, рассылка ходов, уведомления об отключении — всё это требует push-сообщений от сервера к клиенту.

**Решение:** приложение работает на кастомном HTTP-сервере (`server.js`), который:

- Обслуживает обычные HTTP-запросы через Next.js `handle()`
- Накладывает Socket.IO поверх того же HTTP-сервера для WebSocket

API Routes (`/app/api/...`) продолжают работать как обычно — custom server просто добавляет слой Socket.IO. В production используется `node server.js`, в development — `tsx watch server.js`.

### 2.2. Почему Better-Auth, а не NextAuth.js / Clerk / свой JWT

**Better-Auth** — современная лёгкая библиотека с нативным адаптером для Drizzle ORM.

- Поддерживает email/password, OAuth (Google, GitHub), управление сессиями на куках.
- API верификации сессий одинаково работает в API Routes и в Socket.IO middleware.
- Не требует отдельной базы данных: адаптер `drizzleAdapter` маппит таблицы Better-Auth (`sessions`, `accounts`, `verifications`) на уже существующую схему Drizzle.
- Не использует сторонние интерфейсы (в отличие от Clerk).
### 2.3. Почему Socket.IO, а не raw WebSocket или WebRTC

- **Автоматическое переподключение** и fallback на HTTP long-polling в средах, где WebSocket заблокирован.
- **Нативная поддержка комнат** (`socket.join()`), что идеально ложится на модель «игровая комната» и «личная комната пользователя».
- Зрелый middleware для аутентификации и rate limiting.
- Для горизонтального масштабирования можно подключить Redis-адаптер (пока не реализовано).
### 2.4. Зачем `AsyncQueue` для операций с часами

Node.js однопоточен, но Socket.IO-обработчики асинхронны и могут пересекаться на `await`. Два игрока, одновременно подключающихся к одной игре, могли бы оба вызвать `startClock`, что привело бы к удвоенному старту. `AsyncQueue` сериализует все мутации для одного `gameId` в цепочку промисов, гарантируя атомарность «проверка → изменение» без блокировок.

### 2.5. Почему Stockfish работает как дочерние процессы, а не в Worker threads

Пакет `stockfish` (WASM/Emscripten) нельзя загрузить через `require()` внутри `worker_threads` — разрешение WASM-пути отличается между главным потоком и воркером. Кроме того, `Module.print` не перехватывается надёжно в контексте Worker.

**Решение:** каждый экземпляр Stockfish запускается как отдельный дочерний процесс (`child_process.spawn`) и общается с ним через UCI-протокол (`position fen ...`, `go depth N`). Пул управляет жизненным циклом: простаивающие процессы уничтожаются через 60с для освобождения ~130 МБ ОЗУ и пересоздаются по запросу.

### 2.6. Почему matchmaking in-memory, а не Redis

Очередь подбора (`matchmaking.ts`) хранит записи в памяти. Это работает для single-server деплоя. Для горизонтального масштабирования (несколько инстансов Node.js) очередь должна быть перенесена в Redis с pub/sub для межсерверной синхронизации. Интерфейс уже спроектирован совместимым с этой миграцией.

## 3. Переменные окружения

Все переменные валидируются через Zod-схему (`env.ts`) при старте сервера. При ошибке сервер выводит читаемое сообщение и завершается с кодом 1.

```env
# === Runtime ===

NODE_ENV=development
    # Режим: development | production | test
    # Влияет на логирование, sourcemaps, перезагрузку модулей.
    # Всегда указывается явно, не полагайтесь на значение по умолчанию.

PORT=3000
    # Порт HTTP-сервера.

HOSTNAME=0.0.0.0
    # Интерфейс для привязки. 0.0.0.0 = все интерфейсы.

# === Database ===

DATABASE_URL=postgresql://user:password@localhost:5432/justchess
    # Обязательно. Поддерживается Neon, Supabase, свой PostgreSQL и т.д.
    # Используется Drizzle ORM для всех запросов.

# === Better-Auth ===

BETTER_AUTH_SECRET=
    # Обязательно. Минимум 32 символа. Секрет для подписи session-кук.
    # Генерация: openssl rand -base64 32

BETTER_AUTH_URL=http://localhost:3000
    # Обязательно. Публичный URL приложения. Используется как baseURL
    # для редиректов авторизации.

# === Client-side ===

NEXT_PUBLIC_APP_URL=http://localhost:3000
    # Публичный URL. Используется в:
    #   1. CORS-настройках Socket.IO
    #   2. Подключении клиента к сокету
    # ВАЖНО: в production должен быть реальный URL (не 127.0.0.1),
    # иначе клиент не сможет подключиться.

# === Redis (опционально) ===

REDIS_URL=redis://localhost:6379
    # Опционально. Если не задан — HTTP rate limiter использует
    # in-memory хранилище (достаточно для одного инстанса,
    # не подходит для нескольких серверов).

# === OAuth (опционально) ===
# Работают только с реальными credentials. Если значение содержит
# подстроку "dev-" — провайдер молча отключается (app запустится без OAuth).

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

---

## 4. Команды
### Запуск

```bash
# Разработка
npm run dev          # Запуск: tsx watch server.js
                      # Next.js + Socket.IO на одном порту

# Production
npm run build         # Сборка Next.js + инлайн env vars
npm start             # NODE_ENV=production node server.js

# База данных (Drizzle)
npm run db:generate   # Сгенерировать миграцию из изменений схемы
npm run db:migrate    # Применить накопленные миграции
npm run db:push       # Пушнуть схему напрямую (только dev!)
npm run db:studio     # Drizzle Studio — GUI для браузера БД

# Качество кода
npm run lint          # ESLint (eslint .)
npm run type-check    # TypeScript (tsc --noEmit)
npm test              # Vitest (run, без watch)
npm run test:watch    # Vitest в режиме watch

# Worker (резерв для будущего)
npm run build:worker  # tsc --project tsconfig.worker.json
```

### Покрытие тестами
Vitest собирает покрытие для:

```
src/lib/elo.ts
src/lib/chess-engine.ts
src/services/game.service.ts
src/server/socket/handlers/**
```

Запустите `npm test -- --coverage` для получения отчёта.

## 5. Схема базы данных

**ER-модель** (упрощённая; полные Drizzle-определения — в `schema.ts`):

```
users ──────────────── user_stats (1:1)
  │                         │
  ├── sessions (1:N)        │
  ├── accounts (1:N)         │
  ├── verifications (1:N)    │
  ├── friendships (N:N через requesterId/addresseeId)
  ├── rating_history (1:N)
  ├── user_achievements (1:N) ──── achievements (N:1)
  ├── player_game_stats (1:N) ──── games (N:1)
  ├── user_daily_stats (1:N)
  │
  ├── whiteGames (1:N)  ──── games
  └── blackGames (1:N)  ──── games
        │
        └── games ──────── game_moves (1:N)
                     └── player_game_stats (1:N, по игроку)
```

### Описание таблиц

| Таблица | Назначение |
|---|---|
| `users` | Профиль пользователя. Совместима с Better-Auth (id, email, name, image) + шахматные поля: username, friendCode, bio, country, isOnline, preferences (JSONB) |
| `sessions` | Сессии Better-Auth: id, token, userId, expiresAt, ipAddress, userAgent |
| `accounts` | OAuth-аккаунты: providerId, accountId → userId |
| `verifications` | Токены верификации email |
| `user_stats` | Рейтинги по контролям времени (rapid/blitz/bullet/classical) + счётчики (победы/поражения/ничьи/бросили) + серии + статистика ИИ + puzzle rating |
| `rating_history` | Лог изменения рейтинга после каждой партии (для графика) |
| `friendships` | Заявки в друзья: requesterId, addresseeId, status (pending/accepted/rejected/blocked) |
| `games` | Партия: игроки, тип, контроль времени, FEN/PGN, результат, снэпшоты рейтинга, снэпшоты часов |
| `game_moves` | Каждый ход: SAN, UCI, FEN после хода, оставшееся время, оценка (centipawns, depth) |
| `achievements` | Определения достижений: id, name, description, category, criteria (JSON) |
| `user_achievements` | Заработанные достижения: userId → achievementId, gameId, earnedAt |
| `player_game_stats` | Статистика игрока в партии: точность, зевки, ошибки, блестящие ходы, время на ход |
| `user_daily_stats` | Дневная агрегация: игры за день, победы, изменения рейтинга, время игры |

### Индексы

Все внешние ключи и колонки, по которым часто фильтруют, имеют индексы:

- `games(status, created_at)` — запрос живых игр
- `games(white_player_id)`, `games(black_player_id)` — история игроков
- `rating_history(user_id, timing_category)` — график рейтинга
- `friendships(status)` — список друзей
- `sessions(token)` — быстрый поиск сессии

---

## 6. REST API Routes

Все routes живут в `app/api/`. Стандартный формат ответа: `{ data, error, meta }`.

### Аутентификация

| Route | Метод | Описание |
|---|---|---|
| `/api/auth/[...all]` | `*` | Better-Auth catch-all: вход, выход, сессия, OAuth |
| `/api/auth/check-availability` | GET | Проверка доступности username/email |

### Пользователи

| Route | Метод | Описание |
|---|---|---|
| `/api/users/search?q=` | GET | Поиск пользователей по username |
| `/api/users/[id]` | GET | Профиль пользователя |
| `/api/users/[id]/profile` | GET, PATCH | Чтение и обновление профиля (username, bio, country, preferences) |
| `/api/users/[id]/stats` | GET | Статистика: рейтинги, счётчики, серии |
| `/api/users/[id]/games` | GET | Пагинированная история партий |
| `/api/users/[id]/rating-history` | GET | История рейтинга для графика |

### Партии

| Route | Метод | Описание |
|---|---|---|
| `/api/games` | GET | Список недавних завершённых партий |
| `/api/games/live` | GET | Активные партии (для наблюдателей) |
| `/api/games/history` | GET | Пагинированная история с фильтрами |
| `/api/games/[id]` | GET | Партия по ID |
| `/api/games/[id]/move` | POST | Сделать ход (для ИИ) |
| `/api/games/[id]/moves` | GET | Все ходы партии по порядку |
| `/api/games/[id]/pgn` | GET | Экспорт PGN строкой |
| `/api/games/[id]/draw-offer` | POST | Предложить/принять/отклонить ничью |
| `/api/games/[id]/resign` | POST | Сдаться |
| `/api/ai` | POST | Создать партию против ИИ (body: `{ difficulty, color, timeControl }`) |
| `/api/ai/difficulty-levels` | GET | Список уровней сложности ИИ |

### Друзья

| Route | Метод | Описание |
|---|---|---|
| `/api/friends` | GET | Список принятых друзей |
| `/api/friends/request` | POST | Отправить заявку в друзья |
| `/api/friends/request/[id]/accept` | POST | Принять заявку |
| `/api/friends/request/[id]/reject` | POST | Отклонить заявку |
| `/api/friends/[id]` | DELETE | Удалить друга / заблокировать |

### Достижения и рейтинг

| Route | Метод | Описание |
|---|---|---|
| `/api/achievements` | GET | Все определения достижений |
| `/api/achievements/user/[id]` | GET | Заработанные достижения пользователя |
| `/api/leaderboard?category=blitz&limit=50` | GET | Таблица лидеров по рейтингу |
## 7. Socket.IO-события

Socket.IO — основной канал для передачи игрового состояния в реальном времени. Все типы событий определены в `socket.ts`.

### Клиент → Сервер

| Событие | Параметры | Описание |
|---|---|---|
| `game:join` | `{ gameId }` | Присоединиться к партии как игрок. При обеих подключениях триггерит `game:started`. Сериализуется через `AsyncQueue` — защита от двойного старта при одновременном подключении двух игроков. |
| `game:move` | `{ gameId, from, to, promotion? }` | Сделать ход. Валидация на сервере (`gameService.makeMove()`). Rate limit: 3/сек. |
| `game:resign` | `{ gameId }` | Сдаться. Rate limit: 1/3сек. |
| `game:offer_draw` | `{ gameId }` | Предложить ничью. Rate limit: 2/5сек. |
| `game:accept_draw` | `{ gameId }` | Принять предложение оппонента. |
| `game:decline_draw` | `{ gameId }` | Отклонить предложение. |
| `game:chat_message` | `{ gameId, message }` | Отправить сообщение (макс. 200 символов, санитизируется). Rate limit: 2/2сек. |
| `spectator:join` | `{ gameId }` | Присоединиться как наблюдатель. |
| `spectator:leave` | `{ gameId }` | Покинуть режим наблюдения. |
| `lobby:join_queue` | `{ gameType, timeControlMinutes, incrementSeconds }` | Войти в очередь подбора. |
| `lobby:leave_queue` | — | Выйти из очереди. |
| `lobby:challenge_friend` | `{ friendId, timeControlMinutes, incrementSeconds }` | Вызвать друга. Истекает через 60 сек. |
| `lobby:accept_challenge` | `{ challengeId }` | Принять вызов друга. |
| `lobby:decline_challenge` | `{ challengeId }` | Отклонить вызов. |

### Сервер → Клиент

| Событие | Параметры | Описание |
|---|---|---|
| `auth:session_evicted` | `{ reason }` | Сессия отозвана (вход с другого устройства). |
| `game:started` | `{ game: GameState }` | Партия началась — полное состояние игры. |
| `game:move_made` | `{ gameId, move, fen, pgn, currentTurn, whiteTimeRemainingMs, blackTimeRemainingMs }` | Ход сделан и валидирован. |
| `game:clock_update` | `{ gameId, whiteTimeRemainingMs, blackTimeRemainingMs, activeColor }` | Тик часов — рассылается каждую секунду. |
| `game:ended` | `{ gameId, result, reason, pgn, whiteRatingChange?, blackRatingChange? }` | Партия завершена. |
| `game:opponent_disconnected` | `{ gameId, color, reconnectDeadlineMs }` | Оппонент отключился — часы приостановлены. Даётся 60 сек на переподключение. |
| `game:opponent_reconnected` | `{ gameId, color }` | Оппонент вернулся — игра возобновляется. |
| `game:draw_offered` | `{ gameId, byColor }` | Оппонент предложил ничью. |
| `game:draw_declined` | `{ gameId, byColor }` | Оппонент отклонил ничью. |
| `game:chat_message` | `{ gameId, userId, username, message, sentAt }` | Получено сообщение в чате. |
| `spectator:count_update` | `{ gameId, count }` | Обновление счётчика наблюдателей. |
| `error:invalid_move` | `{ gameId, reason }` | Сделан невозможный ход. |
| `error:generic` | `{ code, message }` | Общая ошибка. |
| `error:rate_limited` | `{ code, message, event, retryAfterMs }` | Превышен rate limit. |
| `lobby:match_found` | `{ gameId, opponent, color }` | Подбор завершён — создана партия. |
| `lobby:queue_update` | `{ position, estimatedWaitSeconds }` | Позиция в очереди обновилась. |
| `lobby:challenge_received` | `{ challengeId, from, timeControlMinutes, incrementSeconds, expiresAt }` | Получен вызов от друга. |
| `lobby:challenge_accepted` | `{ challengeId, gameId }` | Вызов принят — партия создана. |
| `lobby:challenge_declined` | `{ challengeId }` | Вызов отклонён. |
| `lobby:live_games_update` | `{ games: LiveGame[] }` | Обновление списка живых игр. |
| `achievement:unlocked` | `{ achievementId, name, description, iconUrl?, points }` | Получено новое достижение. |
| `social:friend_online` | `{ userId, username }` | Друг подключился. |
| `social:friend_offline` | `{ userId, username }` | Друг отключился. |
---

## 8. Комментарии к сложным местам

### 8.1. Кастомный адаптер для Better-Auth (Drizzle)
Better-Auth использует свой набор таблиц (`sessions`, `accounts`, `verifications`), которые нужно создать в той же схеме, что и игровые таблицы. Адаптер `drizzleAdapter` настраивает соответствие между таблицами Better-Auth и Drizzle:

```typescript
// src/lib/auth.ts
database: drizzleAdapter(db, {
  provider: "pg",
  schema: {
    user: schema.users,       // наша users, а не Better-Auth users
    session: schema.sessions,
    account: schema.accounts,
    verification: schema.verifications,
  },
})
```

Дополнительные поля (`username`, `friendCode`, `bio`, `country`, `isOnline`, `preferences`) добавлены в Better-Auth через `user.additionalFields`. При создании пользователя срабатывает хук `databaseHooks.user.create.before` — генерируется уникальный `friendCode` (8-символьный код из `nanoid`). После создания срабатывает хук `hooks.after` — автоматически создаётся запись в `user_stats`.

### 8.2. Серверные шахматные часы (`clock-manager.ts`)

Серверные часы работают в основном потоке Node.js (а не в сокете и не в отдельном воркере) — это гарантирует, что тики идут независимо от того, занят ли обработчик сокета. Каждые 100 мс срабатывает `setInterval`, который уменьшает время активного игрока. При достижении 0 вызывается коллбэк `onTimeout` и партия завершается.

**Гонка при одновременном подключении:** когда оба игрока одновременно отправляют `game:join`, сработал бы двойной `startClock`. Защита:

1. `game:join` оборачивается в `AsyncQueue` — второй вызов ждёт завершения первого.
2. `clockManager.getGameState()` проверяется перед `startClock` — если часы уже идут, второй запуск пропускается.

**Гонка при ходе:** после `await makeMove()` время уже могло истечь (другой тик успел сработать). Защита:

1. `clockStateBefore` захватывается **до** `await makeMove()`.
2. После `makeMove()` читается `clockStateAfter` — если часы уже остановлены, ход отклоняется.
3. `switchTurn(expectedActiveColor)` проверяет, что цвет активного игрока не изменился с момента захвата.
### 8.3. Stockfish pool (`stockfish-pool.ts`)

```
Запрос getBestMove(fen, depth, skill)
    → Найти свободный слот
    → Записать onLine-коллбэк
    → Отправить: uci / isready / setoption / position fen ... / go depth N
    → UCI: "bestmove e2e4"
    → Распарсить лучший ход → вернуть Promise
    → Поставить idle-таймер (60 сек)
    → drainQueue() — обработать следующий запрос
```

**UCI-команды:**

- `setoption name UCI_LimitStrength value true` + `Skill Level N` — ограничивает силу (для низких уровней сложности).
- `setoption name UCI_LimitStrength value false` + `Skill Level 20` — полная сила движка для максимального уровня.
- `go depth N` — поиск на фиксированную глубину. Конвертация: `difficulty 1→1`, `10→8`, `20→22`.

**Таймаут:** 10 сек для глубины < 20, 30 сек для глубокого поиска. При таймауте процессу отправляется `stop`, промис отклоняется, слот освобождается. В вызывающем коде (`game.handler.ts`) при отклонении промиса включается fallback на случайный ход из списка возможных.

### 8.4. Подбор игроков (`matchmaking.ts` + `lobby.handler.ts`)

```
Игрок отправляет lobby:join_queue
    → Взять рейтинг из БД
    → Попытка findMatch() с текущим диапазоном (±100)
    → Если соперник найден → создать партию → оповестить обоих
    → Иначе → добавить в очередь → запустить setInterval (каждые 5 сек)
        → Каждые 15 сек диапазон расширяется на ±50 (макс. ±500)
        → При совпадении — создать партию → очистить интервал
```

**Single-session enforcement:** при подключении нового сокета все существующие сокеты того же пользователя отключаются (`session_evicted`). Это предотвращает ситуацию, когда игрок открыл две вкладки и случайно подключился дважды.

### 8.5. Валидация ходов (`game.service.ts`)

Все ходы проходят серверную валидацию:

1. Загрузить партию из БД — проверить статус `active`.
2. Определить цвет игрока (white/black) по `userId`.
3. Воспроизвести все существующие ходы через `chess.js` → получить текущую позицию.
4. Проверить, что ход принадлежит текущему игроку (`chess.turn()`).
5. Проверить легальность хода: `chess.moves({ verbose: true })` → сравнить from/to/promotion.
6. Применить ход через `chess.move()` — только после валидации.
7. Проверить условия завершения: мат, пат, недостаток материала, троекратное повторение, 50 ходов.

Это гарантирует, что клиент не может подменить легальность хода или сделать ход не в свою очередь.

---

## 9. JSDoc для ключевых публичных функций

### `gameService.makeMove`

```typescript
/**
 * Validate and apply a chess move.
 *
 * This is the critical anti-cheat path. All moves MUST go through this function.
 * The function:
 *   1. Loads the game and checks it's active
 *   2. Determines the player's color from userId
 *   3. Reconstructs the current board position by replaying all stored moves
 *   4. Verifies it is the player's turn (not opponent's)
 *   5. Validates the move by comparing against chess.js available moves
 *   6. Applies the move ONLY after all checks pass
 *   7. Checks for game-ending conditions (checkmate, stalemate, draw)
 *   8. Persists the move to DB
 *   9. If game ended — finalises (ratings, stats, achievements)
 *
 * @param options.gameId       - UUID of the game
 * @param options.userId       - ID of player making the move (null for AI moves)
 * @param options.from         - Origin square, e.g. "e2"
 * @param options.to           - Target square, e.g. "e4"
 * @param options.promotion    - Promotion piece: "q" | "r" | "b" | "n"
 * @param options.timeSpentMs  - Time used for this move (ms)
 * @param options.clockRemainingMs - Clock reading at time of move
 * @param options.isAiMove     - True if move is made by AI (skips userId check)
 * @returns { success, san?, uci?, fen?, pgn?, moveNumber?, isCheck?, isCheckmate?,
 *           isStalemate?, isDraw?, gameEnded?, result?, resultReason?,
 *           whiteRatingChange?, blackRatingChange? }
 */
async makeMove(options: MakeMoveOptions): Promise<MakeMoveResult>
```

### `clockManager.switchTurn`

```typescript
/**
 * Switch the active clock after a move (and apply increment).
 *
 * This is an atomic operation — check and update happen together, serialised
 * through the per-game async queue. If `expectedActiveColor` is provided and
 * does not match the current active color at the moment of execution, the
 * increment is NOT applied and the result reports `appliedIncrement: false`.
 *
 * This prevents the following race condition:
 *   1. Player A's handler reads clockState (activeColor = "white")
 *   2. Player A awaits makeMove() — during the await, Player B's handler also
 *      reads clockState (still "white" — hasn't switched yet)
 *   3. Player A's makeMove resolves, switchTurn is enqueued
 *   4. Player B's makeMove resolves, switchTurn is enqueued
 *   5. Player A's switchTurn runs first — color = "white", applies increment
 *   6. Player B's switchTurn runs second — color is now "black" (already switched)
 *      → expectedActiveColor was "white" → mismatch → increment NOT applied
 *
 * @param gameId - UUID of the game
 * @param expectedActiveColor - Expected color to switch FROM (for race detection)
 * @returns { newActiveColor, appliedIncrement: boolean, whiteTimeMs, blackTimeMs }
 */
switchTurn(gameId: string, expectedActiveColor?: 'white' | 'black'): SwitchTurnResult
```