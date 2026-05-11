# emoTrack Deployment and Release Notes

This document is intentionally practical and conservative.

It does not describe a full CI/CD system because this repository does not include one.
It documents the current recommended manual staging and release discipline.

## Scope and Guarantees

Current operational support includes:

- local Windows no-Docker development
- optional Redis/jobs wiring
- polling mode for local development
- webhook mode for deployed environments through `POST /telegram/webhook` when configured
- health endpoints for liveness and readiness checks

This repository does not currently provide:

- automated deployment pipelines
- automated rollback scripts
- automatic migration rollback
- production-grade observability tooling

## Clean Ubuntu Server Runbook

This is the recommended first manual deployment path for a clean Ubuntu server.

Default first deployment shape:

- one Ubuntu server
- local PostgreSQL on the same server
- Node.js 22 LTS or newer supported LTS
- systemd process supervision
- Telegram polling mode first, because it does not require a domain, HTTPS, or Nginx
- Redis/jobs disabled at first unless reminders must be delivered automatically from day one

Use webhook mode later when a domain and HTTPS are ready.

### 1. Connect and update the server

```bash
ssh root@<server_ip>

apt update
apt upgrade -y
```

Install base packages and native libraries needed by Node, Prisma, and chart rendering:

```bash
apt install -y \
  ca-certificates \
  curl \
  git \
  openssl \
  build-essential \
  python3 \
  make \
  g++ \
  pkg-config \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  postgresql \
  postgresql-contrib
```

### 2. Install Node.js

The project requires Node.js 20+, but a current LTS line is preferred for a new server.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

node -v
npm -v
```

Expected result:

- `node -v` is `v22.x` or another supported LTS version
- `npm -v` prints normally

### 3. Create the app user and directories

```bash
useradd --system --create-home --home-dir /opt/emotrack --shell /bin/bash emotrack

mkdir -p /opt/emotrack/app
mkdir -p /opt/emotrack/tmp/charts
mkdir -p /var/backups/emotrack

chown -R emotrack:emotrack /opt/emotrack
chmod 750 /opt/emotrack
```

Backups can stay root-owned:

```bash
chown root:root /var/backups/emotrack
chmod 750 /var/backups/emotrack
```

### 4. Create PostgreSQL database and user

Generate a URL-safe password:

```bash
DB_PASSWORD="$(openssl rand -hex 24)"
echo "$DB_PASSWORD"
```

Save this password securely. It will be used in `DATABASE_URL`.

Create the database user and database:

```bash
sudo -u postgres psql -c "CREATE USER emotrack WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE emotrack OWNER emotrack;"
sudo -u postgres psql -c "ALTER DATABASE emotrack SET timezone TO 'UTC';"
```

Quick connection check:

```bash
PGPASSWORD="$DB_PASSWORD" psql -h localhost -U emotrack -d emotrack -c "select 1;"
```

### 5. Clone the repository

```bash
sudo -u emotrack git clone <repo-url> /opt/emotrack/app
cd /opt/emotrack/app
```

If the repository is private, configure SSH deploy keys or use your normal private repository access before this step.

### 6. Create production `.env`

Create the file:

```bash
sudo -u emotrack cp .env.example .env
sudo -u emotrack nano .env
chmod 600 .env
chown emotrack:emotrack .env
```

Recommended first server `.env` in polling mode:

```env
NODE_ENV=production
PORT=3000

DATABASE_URL=postgresql://emotrack:<db_password_from_step_4>@localhost:5432/emotrack?schema=public
DATABASE_URL_TEST=

REDIS_URL=
REDIS_ENABLED=false
JOBS_ENABLED=false

TELEGRAM_BOT_TOKEN=<real_bot_token_from_BotFather>
TELEGRAM_MODE=polling
TELEGRAM_WEBHOOK_URL=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_STARTUP_TIMEOUT_MS=10000

DEFAULT_TIMEZONE=Europe/Moscow
CHART_TEMP_DIR=/opt/emotrack/tmp/charts
```

Notes:

- if the database password contains special URL characters, URL-encode it; the generated hex password above avoids that problem
- `TELEGRAM_BOT_TOKEN` must be real, not the placeholder from `.env.example`
- `DEFAULT_TIMEZONE` should match the intended default audience; it is applied to newly created users
- changing `DEFAULT_TIMEZONE` does not rewrite existing user rows; update `users.timezone` manually if early users were created with the wrong timezone
- `TELEGRAM_STARTUP_TIMEOUT_MS` bounds Telegram command sync, webhook registration, and polling readiness; polling itself runs as a background long-polling loop and must not block HTTP startup
- polling mode requires outbound HTTPS access to Telegram, but no inbound public port for Telegram

To correct existing users after changing the server default timezone:

```bash
sudo -u postgres psql -d emotrack -c \
"update users set timezone = 'Europe/Moscow' where timezone = 'Europe/Berlin';"
```

### 7. Install dependencies, generate Prisma client, build, migrate, seed

```bash
cd /opt/emotrack/app

sudo -u emotrack npm ci
sudo -u emotrack npx prisma generate
sudo -u emotrack npm run build
sudo -u emotrack npx prisma migrate deploy
sudo -u emotrack npm run prisma:seed
```

Important:

- use `npx prisma migrate deploy` on the server
- do not use `prisma migrate dev` as the production migration command
- run `npm run prisma:seed` after migrations so predefined tags and daily metric definitions exist

### 8. Create a systemd service

Create `/etc/systemd/system/emotrack.service`:

```bash
nano /etc/systemd/system/emotrack.service
```

Service file:

```ini
[Unit]
Description=emoTrack Telegram bot backend
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=emotrack
Group=emotrack
WorkingDirectory=/opt/emotrack/app
EnvironmentFile=/opt/emotrack/app/.env
ExecStart=/usr/bin/npm run start:prod
Restart=always
RestartSec=5
SyslogIdentifier=emotrack
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

If `npm` is not at `/usr/bin/npm`, check the path and update `ExecStart`:

```bash
which npm
```

Start the service:

```bash
systemctl daemon-reload
systemctl enable --now emotrack
systemctl status emotrack --no-pager
```

Watch logs:

```bash
journalctl -u emotrack -f
```

Expected startup signals:

- PostgreSQL connection established
- Telegram commands registered, or a non-fatal warning if Telegram API is temporarily unreachable
- Telegram bot launched in polling mode
- backend running on the configured port
- health endpoints available

If the app starts but Telegram API hangs during command sync, webhook registration, or polling readiness, startup continues after `TELEGRAM_STARTUP_TIMEOUT_MS`. In that case `/health/live` should still return `200`, while `/health/ready` reports Telegram as failed until the bot runtime is fixed.

### 9. Smoke check the deployment

From the server:

```bash
curl -s http://127.0.0.1:3000/health/live
curl -s http://127.0.0.1:3000/health/ready
```

Expected:

- `/health/live` returns `200`
- `/health/ready` returns `200`
- readiness reports database as up
- readiness reports Telegram as up when the bot token is real and Telegram is reachable

Then in Telegram:

1. open the bot
2. send `/start`
3. pass consent/onboarding
4. create one check-in
5. open `/menu`
6. open history and stats

### 10. Firewall for polling mode

Polling mode does not need an open public app port.

Minimal firewall:

```bash
ufw allow OpenSSH
ufw enable
ufw status
```

Do not open port `3000` publicly unless you intentionally expose it behind trusted infrastructure.

### 11. Optional Redis/jobs setup

Use this only when background reminders and weekly digests should run automatically.

Install Redis:

```bash
apt install -y redis-server
systemctl enable --now redis-server
redis-cli ping
```

Update `.env`:

```env
REDIS_URL=redis://127.0.0.1:6379
REDIS_ENABLED=true
JOBS_ENABLED=true
```

Restart:

```bash
systemctl restart emotrack
journalctl -u emotrack -n 100 --no-pager
```

Expected jobs signal:

- startup logs include `event=reminder_jobs_reconciled`, or a clear warning explaining why reconciliation was skipped/failed

### 12. Optional webhook mode with Nginx and HTTPS

Webhook mode is recommended when the server has a domain and HTTPS certificate.

Install Nginx and Certbot:

```bash
apt install -y nginx certbot python3-certbot-nginx
ufw allow 'Nginx Full'
```

Create `/etc/nginx/sites-available/emotrack`:

```nginx
server {
  listen 80;
  server_name <bot_domain>;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable the site:

```bash
ln -s /etc/nginx/sites-available/emotrack /etc/nginx/sites-enabled/emotrack
nginx -t
systemctl reload nginx
```

Issue HTTPS certificate:

```bash
certbot --nginx -d <bot_domain>
```

Generate a webhook secret:

```bash
openssl rand -hex 32
```

Update `.env`:

```env
TELEGRAM_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://<bot_domain>/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=<generated_secret>
```

Restart:

```bash
systemctl restart emotrack
journalctl -u emotrack -n 100 --no-pager
```

Expected startup signal:

- Telegram bot configured for webhook mode
- `/health/ready` returns `200`

Manual webhook endpoint check without a real Telegram update is not enough to prove the full flow. The real smoke check is sending `/start` to the bot and confirming that the server logs receive and process the update.

### 13. Updating an existing server deployment

Before updating, create a database backup:

```bash
sudo -u postgres pg_dump -Fc emotrack | tee /var/backups/emotrack/emotrack_$(date +%F_%H-%M).dump >/dev/null
```

Deploy the new code:

```bash
cd /opt/emotrack/app

sudo -u emotrack git fetch --all --prune
sudo -u emotrack git pull --ff-only
sudo -u emotrack npm ci
sudo -u emotrack npx prisma generate
sudo -u emotrack npm run build
sudo -u emotrack npx prisma migrate deploy
sudo -u emotrack npm run prisma:seed

systemctl restart emotrack
systemctl status emotrack --no-pager
```

Post-update checks:

```bash
curl -s http://127.0.0.1:3000/health/live
curl -s http://127.0.0.1:3000/health/ready
journalctl -u emotrack -n 100 --no-pager
```

### 14. Manual rollback basics

Application rollback:

```bash
cd /opt/emotrack/app

sudo -u emotrack git checkout <previous_known_good_commit_or_tag>
sudo -u emotrack npm ci
sudo -u emotrack npx prisma generate
sudo -u emotrack npm run build

systemctl restart emotrack
```

Database restore from backup, only if required:

```bash
systemctl stop emotrack

sudo -u postgres dropdb emotrack
sudo -u postgres createdb -O emotrack emotrack
sudo -u postgres pg_restore -d emotrack /var/backups/emotrack/<backup_file>.dump

systemctl start emotrack
```

Database restore is destructive. Use it only when the backup and rollback target are clearly identified.

## Recommended Environment Shapes

### Local Development

Recommended local shape:

- `NODE_ENV=development`
- `TELEGRAM_MODE=polling`
- `REDIS_ENABLED=false`
- `JOBS_ENABLED=false`

This is the accepted no-Docker local mode.

### Staging

Recommended staging shape:

- `NODE_ENV=staging`
- public webhook URL available
- `TELEGRAM_MODE=webhook`
- `TELEGRAM_WEBHOOK_URL=https://<host>/telegram/webhook`
- `TELEGRAM_WEBHOOK_SECRET` configured and kept out of logs
- PostgreSQL available
- Redis enabled if reminder jobs or weekly digests must be exercised

These are recommendations, not hard-enforced deployment rules.

### Production

Recommended production shape:

- `NODE_ENV=production`
- `TELEGRAM_MODE=webhook`
- `TELEGRAM_WEBHOOK_URL=https://<host>/telegram/webhook`
- `TELEGRAM_WEBHOOK_SECRET` configured
- PostgreSQL available
- Redis enabled if reminder jobs and weekly digests are required
- health endpoints exposed to trusted operators or internal infrastructure only

## Health Endpoints

### `GET /health/live`

Purpose:

- process liveness only

Contract:

- returns `200` when the Nest process is alive
- does not depend on database, Redis, or BullMQ

### `GET /health/ready`

Purpose:

- operational readiness

Contract:

- always requires database readiness
- requires Redis readiness only when `REDIS_ENABLED=true` or `JOBS_ENABLED=true`
- requires Telegram runtime readiness when a real bot token is configured
- treats Telegram as skipped when the app intentionally runs with a placeholder token or in test mode
- does not fail in the accepted local no-Docker mode where Redis/jobs are disabled

Expected responses:

- `200` when required dependencies are ready
- `503` when a required dependency is unavailable

## Manual Release Checklist

Run these steps before and during a manual release.

1. Confirm the target environment variables are correct.
2. Confirm PostgreSQL is reachable.
3. If reminders or weekly digests are expected, confirm Redis is reachable and both:
   - `REDIS_ENABLED=true`
   - `JOBS_ENABLED=true`
4. Run:
   - `npm run verify`
   - if `DATABASE_URL_TEST` is not configured, `test:db` should skip clearly; for release candidates, prefer running it against an isolated test database
5. Run Prisma generation and migration steps:
   - `npm run prisma:generate`
   - `npm run prisma:migrate`
   - note any additive schema changes in the release notes before deployment
6. Start the app.
7. Verify startup logs:
   - app port
   - Telegram mode
   - Redis/jobs enabled vs disabled
   - health endpoints available
8. Run smoke checks:
   - `GET /health/live`
   - `GET /health/ready`
   - verify `checks.telegram.status` is `up` for staging/production bot runtime
9. If webhook mode is used, verify Telegram webhook configuration:
   - Telegram webhook URL points to `/telegram/webhook`
   - the configured secret matches `TELEGRAM_WEBHOOK_SECRET`
10. Run one minimal product smoke path:
   - `/start` or `/help`

## Operational Log Search

Important warning and error paths use stable `event=...` fields so incidents can be searched without relying on translated text.

Useful event keys:

- `event=telegram_route_failed`
- `event=telegram_fallback_reply_failed`
- `event=telegram_fsm_reset_after_error`
- `event=telegram_webhook_update_skipped`
- `event=telegram_webhook_update_failed`
- `event=stats_chart_generation_failed`
- `event=history_callback_stale`
- `event=http_unhandled_exception`
- `event=readiness_database_check_failed`
- `event=readiness_redis_check_failed`
- `event=summary_persist_failed`
- `event=analytics_track_failed`
- `event=daily_reminder_send_failed`
- `event=weekly_digest_send_failed`
- `event=postgres_connection_failed`
- `event=redis_connection_failed`
- `event=telegram_launch_failed`
- `event=telegram_commands_sync_failed`
- `event=daily_metric_catalog_empty`
- `event=invalid_reminder_time_skipped`
- `event=reminder_jobs_reconcile_skipped`
- `event=reminder_job_reconcile_failed`
- `event=reminder_jobs_reconciled`

During incident review, start with:

1. search by `event=...`
2. narrow by `userId=...` when available
3. narrow Telegram issues by `routeKey=...` and `fsmState=...`
4. check readiness events before investigating product-flow errors

## Post-Deploy Smoke Checks

Recommended minimum checks:

1. `GET /health/live` returns `200`
2. `GET /health/ready` returns `200`
3. Telegram bot responds in the expected mode:
   - polling locally
   - webhook in deployed environments
   - `GET /health/ready` reports Telegram `up` when a real bot token is configured
4. If Redis/jobs are enabled:
   - startup logs `event=reminder_jobs_reconciled`
   - reminder scheduling path does not error at startup
   - weekly digest scheduling path does not error at startup

## Manual Rollback Notes

Rollback is currently manual.

Application rollback:

1. stop the current app version
2. deploy the previous known-good build
3. restore the previous environment configuration if it changed
4. rerun smoke checks

Database rollback:

- there is no automatic Prisma migration rollback flow in this repository
- if a release contains schema changes, rollback must be planned manually before deployment
- the current multi-day event schema change is additive only:
  - `events.eventEndDate` is nullable
  - legacy single-day rows remain valid with `eventEndDate = null`
- the current configurable-check-in groundwork migration is additive/compatible:
  - `users.trackMood` is non-null with default `true`
  - `users.trackEnergy` is non-null with default `true`
  - `users.trackStress` is non-null with default `true`
  - `users.trackSleep` is non-null with default `true`
  - `daily_entries.moodScore` is now nullable
  - `daily_entries.energyScore` is now nullable
  - `daily_entries.stressScore` is now nullable
  - existing users keep the current effective behavior because the new tracking flags default to `true`
- the current daily-metric catalog migration is also additive:
  - `daily_metric_definitions` stores the available catalog of score-based and sleep-block metrics
  - `user_tracked_metrics` stores per-user metric selection
  - `daily_entry_metric_values` stores generic per-entry metric values
  - the seeded catalog is idempotent and includes the current core metrics plus additional score-based metrics
  - the current Telegram UX now uses `user_tracked_metrics` for the configurable daily flow and writes score values into `daily_entry_metric_values` without removing legacy core-field compatibility
- the current series-metadata schema change is also additive only:
  - `events.seriesId` is nullable
  - `events.seriesPosition` is nullable
- user-facing repeated standalone event creation is currently disabled; legacy series-backed rows are ignored in history and stats
  - legacy single-day and multi-day rows remain valid with both fields set to `null`
- recommended safety measure:
  - take a database backup before applying non-trivial migrations
- if rollback is required after a migration:
  - restore from backup, or
  - apply a manual corrective migration

## Staging Expectations vs Enforcement

Important:

- this repository documents recommended staging/production behavior
- it does not enforce a full deployment policy in code
- local Windows no-Docker development remains a first-class supported mode




