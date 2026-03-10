# emoTrack Backend (MVP)

emoTrack is a Telegram-first self-tracking backend (modular NestJS monolith).  
Current implemented product scope includes Phase 2 onboarding + core daily check-in flows.

## Stack

- Node.js 20+
- TypeScript
- NestJS
- Prisma ORM
- PostgreSQL
- Telegraf
- Redis + BullMQ (optional in local development)
- Jest
- ESLint + Prettier

## Local Development on Windows (No Docker Required)

You can run the project locally on Windows with:

- PostgreSQL server installed locally
- pgAdmin as database GUI (optional but recommended)
- Telegram polling mode
- Redis disabled for development

## Important: PostgreSQL vs pgAdmin

- PostgreSQL is the actual database server process.
- pgAdmin is only a GUI client to manage PostgreSQL.
- Installing only pgAdmin is not enough; PostgreSQL server must be installed and running.

## 1. Install PostgreSQL Locally

Install PostgreSQL on Windows (e.g. v15+), then make sure the service is running on:

- host: `localhost`
- port: `5432`

## 2. Create Database/User (via pgAdmin or psql)

Create:

- database: `emotrack`
- user: `emotrack`
- password: `emotrack`

Grant privileges for that user to the database.

## 3. Configure Environment

Create `.env` from `.env.example`:

```powershell
Copy-Item .env.example .env
```

Recommended local values:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://emotrack:emotrack@localhost:5432/emotrack?schema=public

REDIS_URL=
REDIS_ENABLED=false
JOBS_ENABLED=false

TELEGRAM_BOT_TOKEN=replace_with_real_token
TELEGRAM_MODE=polling
TELEGRAM_WEBHOOK_URL=
TELEGRAM_WEBHOOK_SECRET=

DEFAULT_TIMEZONE=Europe/Berlin
CHART_TEMP_DIR=./tmp/charts
```

Notes:

- In local dev with `REDIS_ENABLED=false`, Redis is optional.
- In local dev with `JOBS_ENABLED=false`, BullMQ queue infrastructure is disabled.
- In polling mode, webhook variables can stay empty.

## 4. Install Dependencies

```powershell
npm install
```

## 5. Prisma Setup

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## 6. Start the App (Polling Mode)

```powershell
npm run start:dev
```

or:

```powershell
npm start
```

When `TELEGRAM_MODE=polling`, the bot launches polling locally and does not require webhook URL/secret.

## Optional Docker Path

`docker-compose.yml` is still available as an optional infrastructure path.  
Docker is **not required** for local Windows development.

## Environment Rules

Validation is mode/flag-aware:

- `REDIS_URL` is required only when `REDIS_ENABLED=true` or `JOBS_ENABLED=true`
- `JOBS_ENABLED=true` requires `REDIS_ENABLED=true`
- `TELEGRAM_WEBHOOK_URL` is required only when `TELEGRAM_MODE=webhook`

## Architecture Notes

- App remains a modular monolith (`src/*` domain modules).
- Prisma + PostgreSQL remain the primary persistence layer.
- Redis/BullMQ are feature-infrastructure components and can be disabled in local dev.
- Phase 2 onboarding/check-in behavior is preserved.

## Useful Commands

```powershell
npm run build
npm run lint
npm test
```
