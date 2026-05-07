# Инструкция по деплою на Amvera Cloud

## Предварительные требования

1. Увеличьте лимит памяти в Amvera Cloud до **минимум 1GB** (рекомендуется **2GB**)
2. Убедитесь, что все переменные окружения установлены

## Переменные окружения

В панели управления Amvera Cloud добавьте следующие переменные:

```bash
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_APP_URL=https://justchess-subotch.amvera.io
BETTER_AUTH_URL=https://justchess-subotch.amvera.io
DATABASE_URL=<ваша строка подключения к PostgreSQL>
BETTER_AUTH_SECRET=<минимум 32 случайных символа>
```

## Конфигурация amvera.yaml

Файл `amvera.yaml` настроен следующим образом:

```yaml
meta:
  environment: nodejs
  toolchain:
    name: npm
    version: "20"
build:
  skip: false
  additionalCommands: |
    NODE_OPTIONS="--max-old-space-size=2048" npm run build
  artifacts:
    "*": /
run:
  nodeArguments: --max-old-space-size=1024
  command: npx tsx server.js
  persistenceMount: /data
  containerPort: "3000"
  servicePort: "3000"
```

### Что это делает:
- **build**: Запускает `npm run build` с лимитом памяти 2GB для сборки
- **run**: Запускает кастомный сервер с Socket.IO с лимитом памяти 1GB

## Шаги деплоя

1. **Обновите код** с новыми изменениями (push в репозиторий)
2. **Настройте переменные окружения** в панели Amvera Cloud
3. **Увеличьте лимит памяти** до минимум 1GB
4. **Пересоберите приложение** в панели Amvera Cloud

## Проверка

После деплоя проверьте логи:
```
[server] Starting in production mode on ...
> Ready on http://0.0.0.0:3000 [production]
```

Если видите ошибку:
```
Error: Could not find a production build in the '.next' directory
```

Это означает, что сборка не завершилась успешно. Проверьте логи сборки в панели Amvera Cloud.

## Устранение проблем

### Ошибка 503 Service Unavailable
- Убедитесь, что `NODE_ENV=production` установлен
- Проверьте, что память увеличена до минимум 1GB
- Проверьте логи на наличие ошибок при старте

### Ошибка сборки
- Проверьте, что все зависимости установлены (`package.json`)
- Убедитесь, что `DATABASE_URL` и другие переменные установлены
- Попробуйте увеличить лимит памяти для сборки до 2GB

### Ошибка памяти (OOM)
- Увеличьте лимит памяти в Amvera Cloud до 2GB
- Уменьшите `max-old-space-size` в `amvera.yaml` если нужно

## Логи

Просматривайте логи в реальном времени в панели Amvera Cloud:
- Логи сборки (build logs)
- Логи выполнения (runtime logs)

Ключевые сообщения в логах:
```
[server] Starting in production mode on ...
[stockfish-pool] Запуск 1 дочерних процессов Stockfish...
[stockfish-pool] Пул готов: 1/1 процессов
> Ready on http://0.0.0.0:3000 [production]
```
