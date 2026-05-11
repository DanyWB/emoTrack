# emoTrack Server Runbook

Этот файл описывает практическую работу с текущим сервером emoTrack после первого деплоя.

## 1. Текущая схема сервера

Текущий production-like сервер:

- Ubuntu server
- app path: `/opt/emotrack/app`
- app user: `emotrack`
- systemd service: `emotrack`
- runtime command: `npm run start:prod`
- Node entrypoint: `dist/src/main.js`
- database: local PostgreSQL, database `emotrack`
- Redis: local Redis, enabled
- jobs: enabled
- Telegram mode: polling
- app port: `3000`, only local checks expected
- health endpoints:
  - `http://127.0.0.1:3000/health/live`
  - `http://127.0.0.1:3000/health/ready`

Important server env expectations:

```env
NODE_ENV=production
PORT=3000
REDIS_URL=redis://127.0.0.1:6379
REDIS_ENABLED=true
JOBS_ENABLED=true
TELEGRAM_MODE=polling
TELEGRAM_STARTUP_TIMEOUT_MS=10000
DEFAULT_TIMEZONE=Europe/Moscow
CHART_TEMP_DIR=/opt/emotrack/tmp/charts
NODE_OPTIONS=--dns-result-order=ipv4first
```

Secrets are stored only in `/opt/emotrack/app/.env`.

## 2. Command Ownership Rules

Run service and OS commands as `root`:

```bash
systemctl status emotrack --no-pager -l
journalctl -u emotrack -f
```

Run project commands as `emotrack`:

```bash
sudo -u emotrack git status --short
sudo -u emotrack npm ci
sudo -u emotrack npm run build
sudo -u emotrack npx prisma generate
sudo -u emotrack npx prisma migrate deploy
sudo -u emotrack npm run prisma:seed
```

Do not run `git`, `npm`, or `npx prisma` as root inside `/opt/emotrack/app`. If that happens, file permissions can break.

Permission repair:

```bash
chown -R emotrack:emotrack /opt/emotrack/app
chown -R emotrack:emotrack /opt/emotrack/.npm
```

## 3. Quick Health Check

```bash
cd /opt/emotrack/app

systemctl status emotrack --no-pager -l
curl -i --max-time 5 http://127.0.0.1:3000/health/live
curl -i --max-time 5 http://127.0.0.1:3000/health/ready
```

Expected:

- service is `active (running)`
- `/health/live` returns `200`
- `/health/ready` returns `200`
- database is `up`
- redis is `up`
- telegram is `up`

Logs:

```bash
journalctl -u emotrack -n 120 --no-pager -l
journalctl -u emotrack -f
```

Useful successful startup lines:

```text
PostgreSQL connection established.
Redis connection established (PONG)
event=reminder_jobs_reconciled
Telegram commands registered.
Telegram bot launched in polling mode.
emoTrack backend is running on port 3000
```

## 4. Normal Update Flow

Use this after new commits are pushed to GitHub.

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

If `git pull --ff-only` complains about local changes, inspect first:

```bash
sudo -u emotrack git diff
```

If the local change is only an old emergency server edit already present in GitHub, restore that file:

```bash
sudo -u emotrack git restore <file>
sudo -u emotrack git pull --ff-only
```

## 5. Env Change Flow

Edit env:

```bash
cd /opt/emotrack/app
nano .env
```

Restart:

```bash
systemctl restart emotrack
sleep 20
journalctl -u emotrack -n 120 --no-pager -l
curl -i --max-time 5 http://127.0.0.1:3000/health/ready
```

Check env without printing secrets:

```bash
grep -nE '^(NODE_ENV|PORT|REDIS_URL|REDIS_ENABLED|JOBS_ENABLED|TELEGRAM_MODE|TELEGRAM_STARTUP_TIMEOUT_MS|DEFAULT_TIMEZONE|NODE_OPTIONS)=' .env
grep -n '^TELEGRAM_BOT_TOKEN=' .env | sed -E 's/(TELEGRAM_BOT_TOKEN=.{8}).+/\1[REDACTED]/'
```

## 6. Reminder Operations

Reminder prerequisites:

- `REDIS_ENABLED=true`
- `JOBS_ENABLED=true`
- Redis responds with `PONG`
- user has completed onboarding
- user has `remindersEnabled=true`
- user has non-empty `reminderTime`
- user timezone is correct

Check Redis:

```bash
redis-cli ping
```

Check users:

```bash
sudo -u postgres psql -d emotrack -c \
"select \"telegramId\", timezone, \"onboardingCompleted\", \"remindersEnabled\", \"reminderTime\" from users order by \"createdAt\" desc;"
```

After changing timezone or reminder settings directly in DB, restart the service so repeatable jobs are reconciled:

```bash
systemctl restart emotrack
sleep 20
journalctl -u emotrack -n 120 --no-pager -l | grep -E 'reminder_jobs_reconciled|Scheduled daily reminder|daily_reminder_send_failed|Sent daily reminder'
```

Manual functional check:

1. In Telegram open `/settings`.
2. Enable reminders.
3. Set reminder time to 2-3 minutes ahead in `Europe/Moscow`.
4. Watch logs:

```bash
journalctl -u emotrack -f
```

Expected when a reminder is delivered:

```text
Sent daily reminder to user <userId>
```

If the user already has today's check-in, daily reminder is skipped.

## 7. Timezone Fixes

`DEFAULT_TIMEZONE` affects newly created users. Existing users keep `users.timezone` from the database.

Show current timezones:

```bash
sudo -u postgres psql -d emotrack -c \
"select \"telegramId\", timezone, \"reminderTime\", \"remindersEnabled\" from users;"
```

Move early Berlin users to Moscow:

```bash
sudo -u postgres psql -d emotrack -c \
"update users set timezone = 'Europe/Moscow' where timezone = 'Europe/Berlin';"
```

Then restart to reconcile jobs:

```bash
systemctl restart emotrack
sleep 20
journalctl -u emotrack -n 120 --no-pager -l | grep -E 'Scheduled daily reminder|reminder_jobs_reconciled'
```

## 8. Telegram Checks

Check token validity without exposing it:

```bash
cd /opt/emotrack/app

TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2-)
curl -i --connect-timeout 10 --max-time 20 "https://api.telegram.org/bot${TOKEN}/getMe"
unset TOKEN
```

Expected:

```json
{"ok":true}
```

If `curl` works but app startup has Telegram problems, check:

```bash
journalctl -u emotrack -n 160 --no-pager -l | grep -E 'Telegram|telegram_'
```

Expected healthy line:

```text
Telegram bot launched in polling mode.
```

## 9. Rollback

Application rollback:

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

Database restore is destructive. Use it only if the exact backup and rollback target are known:

```bash
systemctl stop emotrack

sudo -u postgres dropdb emotrack
sudo -u postgres createdb -O emotrack emotrack
sudo -u postgres pg_restore -d emotrack /var/backups/emotrack/<backup_file>.dump

systemctl start emotrack
```

## 10. Known Troubleshooting

### Git dubious ownership

Cause: running Git as root in a repo owned by `emotrack`.

Use:

```bash
sudo -u emotrack git status --short
```

### EACCES in `node_modules`

Cause: `npm` or `npx prisma` was run as root.

Fix:

```bash
systemctl stop emotrack
chown -R emotrack:emotrack /opt/emotrack/app
chown -R emotrack:emotrack /opt/emotrack/.npm
sudo -u emotrack npm ci
```

### `Cannot find module dist/main.js`

Correct production entrypoint is:

```json
"start:prod": "node dist/src/main.js"
```

After pulling a fixed version:

```bash
sudo -u emotrack npm run build
systemctl restart emotrack
```

### Redis env validation error

Error:

```text
REDIS_URL is required when REDIS_ENABLED=true or JOBS_ENABLED=true
```

Fix `.env` either to enabled:

```env
REDIS_URL=redis://127.0.0.1:6379
REDIS_ENABLED=true
JOBS_ENABLED=true
```

or disabled:

```env
REDIS_URL=
REDIS_ENABLED=false
JOBS_ENABLED=false
```

### `/health/live` is 200, `/health/ready` is 503

Readiness means a required dependency is down. Check body and logs:

```bash
curl -s http://127.0.0.1:3000/health/ready
journalctl -u emotrack -n 120 --no-pager -l
```

Common causes:

- database down
- Redis down while Redis/jobs are enabled
- Telegram runtime failed

### SSH session closes during build

Check memory and disk:

```bash
free -h
df -h
journalctl -p err -n 80 --no-pager -l
```

Then rerun update commands after reconnecting.

