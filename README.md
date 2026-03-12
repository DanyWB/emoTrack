# emoTrack Backend MVP

emoTrack is a Telegram-first self-tracking backend built as a modular NestJS monolith.  
The MVP focuses on daily state tracking, optional notes/tags/events, recent history, stats, server-side charts, reminders, and basic settings.

## Product Scope

The bot helps a user:

- complete onboarding with consent and reminder time
- log one daily check-in per day
- update the same day entry instead of creating duplicates
- add an optional note, predefined tags, and an event
- create standalone events
- view recent history
- request 7-day, 30-day, or all-time stats
- receive chart images in the stats flow
- manage reminder toggle, reminder time, and sleep mode

This MVP is:

- a tracker
- a self-reflection tool
- a pattern observation tool

This MVP is not:

- a therapist
- a diagnostic tool
- a crisis assistant
- an AI chat product

## Stack

- Node.js 20+
- TypeScript
- NestJS
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Telegraf
- chartjs-node-canvas
- dayjs
- Jest
- ESLint
- Prettier

## Architecture Overview

The project uses a modular monolith structure. The backend is a single NestJS application with separate domain modules and shared infrastructure.

Core modules:

- `telegram`: Telegraf bootstrap, routing, keyboards, centralized Russian copy
- `users`: Telegram user lifecycle and settings persistence
- `onboarding`: consent and reminder-time onboarding flow
- `fsm`: persistent finite-state machine backed by PostgreSQL
- `checkins`: daily entry upsert, notes, tags, recent history
- `events`: standalone and check-in event flows
- `tags`: predefined tag queries and validation
- `stats`: period calculations and summary payload building
- `summaries`: summary persistence and Russian formatter
- `charts`: server-side PNG chart rendering
- `reminders`: reminder scheduling/sending with graceful no-op behavior when jobs are disabled
- `analytics`: internal product event tracking
- `database`: Prisma and optional Redis wiring

Important design choices:

- `DailyEntry.entryDate` is treated as a normalized user-local day key.
- FSM state is persisted in `FsmSession`, not in memory.
- Redis and BullMQ are optional in local development.
- Telegram supports polling locally and webhook mode when configured.

## Repository Layout

Key top-level directories:

- `src/`: application code
- `prisma/`: Prisma schema, migrations, seed
- `test/`: unit and integration tests
- `docs/`: project documentation, including QA checklist

## Local Windows Setup Without Docker

Docker is optional. Local Windows development does not require Docker.

### PostgreSQL vs pgAdmin

- PostgreSQL is the actual database server.
- pgAdmin is only a GUI client for PostgreSQL.
- Installing pgAdmin alone is not enough. PostgreSQL server must be installed and running locally.

### Local Prerequisites

- Node.js 20+
- npm
- PostgreSQL running on `localhost:5432`
- optional: pgAdmin
- optional: Redis, only if you want background jobs enabled locally

### 1. Create Database and User

Create a local PostgreSQL database and user, for example:

- database: `emotrack`
- user: `emotrack`
- password: `emotrack`

Expected local connection string:

```env
DATABASE_URL=postgresql://emotrack:emotrack@localhost:5432/emotrack?schema=public
```

### 2. Configure Environment

Create `.env` from `.env.example`:

```powershell
Copy-Item .env.example .env
```

Example local development configuration:

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

### 3. Install Dependencies

```powershell
npm install
```

### 4. Prepare Prisma

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

The project includes:

- Prisma schema
- migrations
- idempotent seed for predefined tags

### 5. Run the Bot Locally

```powershell
npm run start:dev
```

or:

```powershell
npm start
```

With `TELEGRAM_MODE=polling`, the bot starts in polling mode and does not require webhook variables.

## Polling Mode vs Webhook Mode

### Polling

Use for local development:

- `TELEGRAM_MODE=polling`
- `TELEGRAM_WEBHOOK_URL` can stay empty
- `TELEGRAM_WEBHOOK_SECRET` can stay empty

### Webhook

Use when deploying behind a reachable public URL:

- `TELEGRAM_MODE=webhook`
- `TELEGRAM_WEBHOOK_URL` must be set
- `TELEGRAM_WEBHOOK_SECRET` is recommended

## Redis and Jobs Behavior

Redis and BullMQ are supported, but not required for local development.

Rules:

- if `REDIS_ENABLED=false`, Redis is not required for boot
- if `JOBS_ENABLED=false`, BullMQ queues/processors do not block startup
- reminder settings still persist even if background jobs are disabled
- reminder scheduling methods degrade to no-op when jobs are disabled

If you want local reminder jobs, set:

```env
REDIS_ENABLED=true
JOBS_ENABLED=true
REDIS_URL=redis://localhost:6379
```

## Environment Variables

Main variables used by the app:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `REDIS_ENABLED`
- `JOBS_ENABLED`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_MODE`
- `TELEGRAM_WEBHOOK_URL`
- `TELEGRAM_WEBHOOK_SECRET`
- `DEFAULT_TIMEZONE`
- `CHART_TEMP_DIR`

Validation rules are mode-aware:

- `REDIS_URL` is required only when Redis/jobs are enabled
- `JOBS_ENABLED=true` requires Redis to be enabled
- webhook URL is required only in webhook mode

## Commands

Development:

```powershell
npm run start:dev
npm run build
npm run lint
```

Testing:

```powershell
npm test
npm run test:watch
```

Prisma:

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Testing Strategy

Tests are split into:

- unit tests for deterministic logic
- integration tests for critical flows

Covered areas:

- stats calculations
- summary formatting
- daily entry same-day upsert
- validation helpers
- onboarding flow
- check-in flow
- repeated same-day check-in update behavior
- summary generation path
- chart failure fallback path

Test design notes:

- tests do not require Docker
- tests do not require Redis
- tests use in-memory repositories and Nest testing utilities for critical flow wiring

## Check-in UX Notes

Current check-in behavior is intentionally conservative:

- `/checkin` resumes an active check-in instead of silently resetting progress
- `Back` is available on optional note/tag/event branches where the FSM supports it
- if a user returns to core sleep steps after already saving optional note/tag data in the same flow, the final confirmation still reflects that saved optional data
- if the check-in FSM loses context, the user gets a safe restart message instead of a raw or ambiguous error
- same-day upsert behavior remains unchanged: one normalized day key, one `DailyEntry`

## History UX Notes

Current `/history` behavior stays intentionally simple:

- the first page shows the most recent 5 entries in a compact Telegram-friendly layout
- each item still shows date, mood/energy/stress, sleep data when present, note marker, and linked event count
- older entries are loaded through a single inline `Еще` action
- `Еще` edits the same history message instead of appending duplicate history blocks
- stale `Еще` callbacks degrade gracefully and ask the user to open `/history` again

## Stats Readability Notes

Current `/stats` behavior keeps the original calculations and period boundaries unchanged, but improves output readability.

Low-data contract:

- `0` entries in the selected period: empty-state message
- `1-2` entries in the selected period: preliminary text summary, no charts
- `3+` entries in the selected period: full summary text and chart sending

This threshold is explicit by design. It is only a presentation rule and does not change the underlying stats calculations.

## Logging and Error Handling

Operational logging is added around:

- application startup
- PostgreSQL connection lifecycle
- Telegram startup mode
- onboarding completion
- check-in create/update
- stats generation
- chart generation
- reminder scheduling and cancellation

Safety behavior:

- raw stack traces are not sent to Telegram users
- unexpected Telegram route failures are caught and degraded gracefully
- broken FSM sessions are reset to `idle`
- chart failures do not break `/stats`
- analytics persistence failures do not break user flows
- summary persistence failures do not break `/stats`

## Charts and Temp Files

Chart rendering is buffer-based through `chartjs-node-canvas`.

Current behavior:

- chart images are generated in memory
- no chart temp files are written during normal stats flow
- `CHART_TEMP_DIR` is still prepared at startup so local and deployed environments have a valid writable location if future file-based rendering is introduced

Because rendering is buffer-based, there is no temp-file accumulation cleanup requirement in the current MVP.

Chart presentation notes:

- chart semantics are unchanged: the same metrics are charted in the same `/stats` flow
- charts are tuned for Telegram/mobile readability rather than visual redesign
- x-axis label density is capped for longer periods
- date labels are shortened for better mobile legibility
- point markers are more visible for small normal datasets such as `3-5` entries
- legend and grid styling are tuned to remain readable on phone screens

## Manual QA Checklist

See the manual QA checklist here:

- [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md)

## Known MVP Limitations

- history navigation is intentionally simple and only supports sequential `Еще` loading
- no data export
- no account deletion flow yet
- no advanced reminder UI beyond current settings
- no AI insights layer
- no admin interface
- no production-grade observability stack yet

## Extension Points

Natural next steps after the MVP:

- broader settings coverage for optional modules
- scheduled weekly summaries in user-facing UX
- export and privacy tooling
- richer analytics dashboards
- deployment manifests and production monitoring

## Optional Docker Path

`docker-compose.yml` remains available as an optional infrastructure path for PostgreSQL and Redis, but Docker is not required for local Windows development.
