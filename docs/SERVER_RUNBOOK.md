# emoTrack: инструкция по работе с сервером

Этот файл описывает практическую работу с текущим сервером emoTrack после первого деплоя.

## 1. Текущая схема сервера

Текущий сервер:

- ОС: Ubuntu
- путь проекта: `/opt/emotrack/app`
- пользователь приложения: `emotrack`
- systemd-сервис: `emotrack`
- команда запуска: `npm run start:prod`
- Node entrypoint: `dist/src/main.js`
- база данных: локальный PostgreSQL, база `emotrack`
- Redis: локальный Redis, включен
- фоновые jobs: включены
- Telegram mode: polling
- порт приложения: `3000`, проверяется локально с сервера
- health endpoints:
  - `http://127.0.0.1:3000/health/live`
  - `http://127.0.0.1:3000/health/ready`

Ожидаемые важные настройки в `/opt/emotrack/app/.env`:

```env
NODE_ENV=production
PORT=3000
REDIS_URL=redis://127.0.0.1:6379
REDIS_ENABLED=true
JOBS_ENABLED=true
TELEGRAM_MODE=polling
TELEGRAM_STARTUP_TIMEOUT_MS=10000
ADMIN_TELEGRAM_IDS=
DEFAULT_TIMEZONE=Europe/Moscow
CHART_TEMP_DIR=/opt/emotrack/tmp/charts
NODE_OPTIONS=--dns-result-order=ipv4first
```

Секреты хранятся только в `/opt/emotrack/app/.env`.

## 2. Правило владельца команд

Команды сервиса и ОС выполняются от `root`:

```bash
systemctl status emotrack --no-pager -l
journalctl -u emotrack -f
```

Команды проекта выполняются от пользователя `emotrack`:

```bash
sudo -u emotrack git status --short
sudo -u emotrack npm ci
sudo -u emotrack npm run build
sudo -u emotrack npx prisma generate
sudo -u emotrack npx prisma migrate deploy
sudo -u emotrack npm run prisma:seed
```

Не запускай `git`, `npm` и `npx prisma` от `root` внутри `/opt/emotrack/app`. Иначе можно сломать права на `node_modules` и Prisma client.

Если права сломались:

```bash
chown -R emotrack:emotrack /opt/emotrack/app
chown -R emotrack:emotrack /opt/emotrack/.npm
```

## 3. Быстрая проверка состояния

```bash
cd /opt/emotrack/app

systemctl status emotrack --no-pager -l
curl -i --max-time 5 http://127.0.0.1:3000/health/live
curl -i --max-time 5 http://127.0.0.1:3000/health/ready
```

Ожидаемый результат:

- service находится в состоянии `active (running)`
- `/health/live` возвращает `200`
- `/health/ready` возвращает `200`
- database: `up`
- redis: `up`
- telegram: `up`

Логи:

```bash
journalctl -u emotrack -n 120 --no-pager -l
journalctl -u emotrack -f
```

Нормальные строки успешного запуска:

```text
PostgreSQL connection established.
Redis connection established (PONG)
event=reminder_jobs_reconciled
Telegram commands registered.
Telegram bot launched in polling mode.
emoTrack backend is running on port 3000
```

## 4. Обычное обновление сервера

Используй этот сценарий после того, как новые коммиты запушены в GitHub.

```bash
cd /opt/emotrack/app

systemctl stop emotrack

sudo -u postgres pg_dump -Fc emotrack | tee /var/backups/emotrack/emotrack_$(date +%F_%H-%M).dump >/dev/null

sudo -u emotrack git status --short
sudo -u emotrack git pull --ff-only

sudo -u emotrack npm ci
sudo -u emotrack npx prisma generate
sudo -u emotrack npm run build
sudo -u emotrack npx prisma migrate deploy
sudo -u emotrack npm run prisma:seed

systemctl start emotrack
sleep 20

systemctl status emotrack --no-pager -l
curl -i --max-time 5 http://127.0.0.1:3000/health/live
curl -i --max-time 5 http://127.0.0.1:3000/health/ready
```

Если `git pull --ff-only` ругается на локальные изменения, сначала посмотри diff:

```bash
sudo -u emotrack git diff
```

Если локальное изменение было временной серверной правкой и уже есть в GitHub, можно восстановить файл:

```bash
sudo -u emotrack git restore <file>
sudo -u emotrack git pull --ff-only
```

## 5. Изменение `.env`

Открыть env:

```bash
cd /opt/emotrack/app
nano .env
```

Перезапустить приложение:

```bash
systemctl restart emotrack
sleep 20
journalctl -u emotrack -n 120 --no-pager -l
curl -i --max-time 5 http://127.0.0.1:3000/health/ready
```

Проверить env без вывода токена:

```bash
grep -nE '^(NODE_ENV|PORT|REDIS_URL|REDIS_ENABLED|JOBS_ENABLED|TELEGRAM_MODE|TELEGRAM_STARTUP_TIMEOUT_MS|ADMIN_TELEGRAM_IDS|DEFAULT_TIMEZONE|NODE_OPTIONS)=' .env
grep -n '^TELEGRAM_BOT_TOKEN=' .env | sed -E 's/(TELEGRAM_BOT_TOKEN=.{8}).+/\1[REDACTED]/'
```

`ADMIN_TELEGRAM_IDS` — это список Telegram id администраторов через запятую. Команда `/admin` скрыта из публичного списка команд, но работает для этих id.

### Включить доступ к админке

1. Узнай свой numeric Telegram id.
2. Добавь его в env:

```bash
cd /opt/emotrack/app
nano .env
```

```env
ADMIN_TELEGRAM_IDS=123456789
```

Если администраторов несколько:

```env
ADMIN_TELEGRAM_IDS=123456789,987654321
```

3. Перезапусти сервис и проверь health:

```bash
systemctl restart emotrack
sleep 20
curl -i --max-time 5 http://127.0.0.1:3000/health/ready
```

4. В Telegram отправь `/admin`. Ожидается админ-меню с общей статистикой и активными пользователями.

## 6. Напоминания

Условия работы напоминаний:

- `REDIS_ENABLED=true`
- `JOBS_ENABLED=true`
- Redis отвечает `PONG`
- пользователь прошел onboarding
- у пользователя `remindersEnabled=true`
- у пользователя заполнен `reminderTime`
- timezone пользователя корректный

Проверить Redis:

```bash
redis-cli ping
```

Проверить пользователей:

```bash
sudo -u postgres psql -d emotrack -c \
"select \"telegramId\", timezone, \"onboardingCompleted\", \"remindersEnabled\", \"reminderTime\" from users order by \"createdAt\" desc;"
```

После ручного изменения timezone или reminder-настроек в БД перезапусти сервис, чтобы repeatable jobs пересобрались:

```bash
systemctl restart emotrack
sleep 20
journalctl -u emotrack -n 120 --no-pager -l | grep -E 'reminder_jobs_reconciled|Scheduled daily reminder|daily_reminder_send_failed|Sent daily reminder'
```

Ручная проверка напоминаний:

1. В Telegram открой `/settings`.
2. Включи напоминания.
3. Поставь время на 2-3 минуты вперед по `Europe/Moscow`.
4. Смотри логи:

```bash
journalctl -u emotrack -f
```

Ожидаемая строка при отправке:

```text
Sent daily reminder to user <userId>
```

Если у пользователя уже есть check-in за сегодня, ежедневное напоминание не отправляется.

## 7. Timezone

`DEFAULT_TIMEZONE` применяется к новым пользователям. Уже созданные пользователи хранят timezone в таблице `users`.

Показать текущие timezone:

```bash
sudo -u postgres psql -d emotrack -c \
"select \"telegramId\", timezone, \"reminderTime\", \"remindersEnabled\" from users;"
```

Перевести ранних пользователей с Berlin на Moscow:

```bash
sudo -u postgres psql -d emotrack -c \
"update users set timezone = 'Europe/Moscow' where timezone = 'Europe/Berlin';"
```

После этого перезапустить сервис, чтобы jobs пересобрались:

```bash
systemctl restart emotrack
sleep 20
journalctl -u emotrack -n 120 --no-pager -l | grep -E 'Scheduled daily reminder|reminder_jobs_reconciled'
```

## 8. Telegram

Проверить валидность токена, не выводя его в чат:

```bash
cd /opt/emotrack/app

TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2-)
curl -i --connect-timeout 10 --max-time 20 "https://api.telegram.org/bot${TOKEN}/getMe"
unset TOKEN
```

Ожидается:

```json
{"ok":true}
```

Если `curl` работает, но у приложения есть проблемы с Telegram, смотреть так:

```bash
journalctl -u emotrack -n 160 --no-pager -l | grep -E 'Telegram|telegram_'
```

Здоровая строка:

```text
Telegram bot launched in polling mode.
```

## 9. Rollback

Rollback приложения:

```bash
cd /opt/emotrack/app

systemctl stop emotrack

sudo -u emotrack git checkout <previous_good_commit_or_tag>
sudo -u emotrack npm ci
sudo -u emotrack npx prisma generate
sudo -u emotrack npm run build

systemctl start emotrack
sleep 20
curl -i --max-time 5 http://127.0.0.1:3000/health/ready
```

Восстановление БД из backup разрушает текущую БД. Делать только если точно выбран правильный backup и commit:

```bash
systemctl stop emotrack

sudo -u postgres dropdb emotrack
sudo -u postgres createdb -O emotrack emotrack
sudo -u postgres pg_restore -d emotrack /var/backups/emotrack/<backup_file>.dump

systemctl start emotrack
```

## 10. Частые проблемы

### Git dubious ownership

Причина: Git запущен от `root` в repo, которым владеет `emotrack`.

Правильно:

```bash
sudo -u emotrack git status --short
```

### EACCES в `node_modules`

Причина: `npm` или `npx prisma` запускались от `root`.

Исправить:

```bash
systemctl stop emotrack
chown -R emotrack:emotrack /opt/emotrack/app
chown -R emotrack:emotrack /opt/emotrack/.npm
sudo -u emotrack npm ci
```

### `Cannot find module dist/main.js`

Правильный production entrypoint:

```json
"start:prod": "node dist/src/main.js"
```

После обновления версии:

```bash
sudo -u emotrack npm run build
systemctl restart emotrack
```

### Ошибка Redis env validation

Ошибка:

```text
REDIS_URL is required when REDIS_ENABLED=true or JOBS_ENABLED=true
```

Вариант с включенным Redis:

```env
REDIS_URL=redis://127.0.0.1:6379
REDIS_ENABLED=true
JOBS_ENABLED=true
```

Вариант с выключенным Redis:

```env
REDIS_URL=
REDIS_ENABLED=false
JOBS_ENABLED=false
```

### `/health/live` = 200, а `/health/ready` = 503

Readiness означает, что обязательная зависимость недоступна. Проверить body и логи:

```bash
curl -s http://127.0.0.1:3000/health/ready
journalctl -u emotrack -n 120 --no-pager -l
```

Частые причины:

- база данных недоступна
- Redis недоступен при включенных Redis/jobs
- Telegram runtime failed

### SSH-сессия закрылась во время build

Проверить память, диск и системные ошибки:

```bash
free -h
df -h
journalctl -p err -n 80 --no-pager -l
```

После повторного подключения можно заново выполнить команды обновления.
