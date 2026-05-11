# emoTrack Backend MVP

emoTrack is a Telegram-first self-tracking backend built as a modular NestJS monolith.  
The MVP focuses on daily state tracking, optional notes/tags/events, recent history, stats, server-side charts, reminders, and basic settings.

## Product Scope

The bot helps a user:

- complete onboarding with consent, optional reminder setup, and an immediate first check-in offer
- log one daily check-in per day
- update the same day entry instead of creating duplicates
- add an optional note, predefined tags, and an event
- create standalone single-day or bounded multi-day events
- use `/menu` for secondary navigation while the bottom keyboard keeps only the two frequent actions
- view recent history
- request 7-day, 30-day, or all-time stats
- receive chart images in the stats flow
- manage reminder toggle, reminder time, sleep mode, and tracked daily metrics

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
- `events`: standalone and check-in event flows, including bounded multi-day events
- `tags`: predefined tag queries and validation
- `stats`: period calculations and summary payload building
- `summaries`: summary persistence and Russian formatter
- `charts`: server-side PNG chart rendering
- `reminders`: reminder scheduling/sending with graceful no-op behavior when jobs are disabled
- `analytics`: internal product event tracking
- `health`: liveness and readiness endpoints for operational checks
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
TELEGRAM_STARTUP_TIMEOUT_MS=10000

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
- idempotent seed for the daily metric catalog used by the configurable check-in groundwork

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
- `TELEGRAM_WEBHOOK_URL` must be set to the public bot endpoint, usually `https://<host>/telegram/webhook`
- `TELEGRAM_WEBHOOK_SECRET` is recommended

Webhook runtime behavior:

- the app exposes `POST /telegram/webhook`
- Telegram updates are dispatched through the same Telegraf router used by polling mode
- when `TELEGRAM_WEBHOOK_SECRET` is configured, the endpoint requires Telegram's `x-telegram-bot-api-secret-token` header
- in polling mode, incoming webhook calls are skipped and logged instead of being processed accidentally

## Redis and Jobs Behavior

Redis and BullMQ are supported, but not required for local development.

Rules:

- if `REDIS_ENABLED=false`, Redis is not required for boot
- if `JOBS_ENABLED=false`, BullMQ queues/processors do not block startup
- local `.env` is loaded before conditional BullMQ module wiring, so `JOBS_ENABLED=true` works from the normal local `.env` workflow as well as from externally injected process env
- reminder settings still persist even if background jobs are disabled
- reminder scheduling methods degrade to no-op when jobs are disabled
- when jobs are enabled, startup reconciles repeatable reminder and weekly digest jobs for users with completed onboarding, enabled reminders, and a saved reminder time

If you want local reminder jobs, set:

```env
REDIS_ENABLED=true
JOBS_ENABLED=true
REDIS_URL=redis://localhost:6379
```

Reminder UX note:

- reminder settings still save even when jobs are disabled locally
- the settings screen explicitly shows when background auto-reminders are unavailable in the current environment
- enabling reminders in local no-jobs mode does not imply that background delivery is actively running
- weekly digest delivery stays disabled when jobs are unavailable locally; the app still boots and settings still persist
- weekly digest v1 reuses the accepted `d7` summary pipeline with a weekly wrapper instead of a separate stats engine
- weekly digest is sent only when the last 7 normalized user-local days include at least 3 entries
- when jobs are enabled, the weekly digest is scheduled for Sunday at the user's reminder time

## Environment Variables

Main variables used by the app:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `DATABASE_URL_TEST`
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
npm run test:unit
npm run test:integration
npm run test:db
npm run test:coverage
npm run audit:prod
npm run test:watch
```

Full local verification:

```powershell
npm run check
npm run verify
```

`npm run verify` runs `npm run check`, the optional DB smoke suite, and the production dependency audit.

Prisma:

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Health Endpoints

Operational health endpoints:

- `GET /health/live`
  - process liveness only
  - does not depend on PostgreSQL, Redis, or BullMQ
- `GET /health/ready`
  - always requires database readiness
  - requires Redis readiness only when Redis or jobs are enabled
  - requires Telegram runtime readiness when a real bot token is configured and the app is not running in test mode
  - reports Telegram as `skipped` for the accepted local placeholder-token workflow
  - stays healthy in the accepted local no-Docker mode with `REDIS_ENABLED=false` and `JOBS_ENABLED=false`

Example local smoke checks:

```powershell
Invoke-WebRequest http://localhost:3000/health/live
Invoke-WebRequest http://localhost:3000/health/ready
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
- Telegram router registration, `/menu` navigation, callback guards, stale callback recovery, and route-error fallback
- repeated same-day check-in update behavior
- summary generation path
- chart failure fallback path

Test design notes:

- tests do not require Docker
- tests do not require Redis
- tests use in-memory repositories and Nest testing utilities for critical flow wiring
- Jest setup mutes routine Nest `Logger.log`, `Logger.debug`, and `Logger.verbose` output so test runs stay readable
- warnings and errors remain visible by default, and tests may spy on them when checking failure paths
- `npm run test:unit` runs the deterministic unit suite only
- `npm run test:integration` runs the current in-memory/Nest integration suite only
- `npm run test:db` runs opt-in PostgreSQL smoke tests against `DATABASE_URL_TEST`
- `npm run test:coverage` runs the full suite with coverage collection for `src/**/*.ts`
- `npm run audit:prod` runs `npm audit --omit=dev`
- global coverage thresholds are intentionally modest baseline gates at 50% for statements, branches, functions, and lines
- `npm run check` is the recommended local pre-handoff gate and runs lint, build, and coverage-backed tests
- `npm run verify` is the stronger release/handoff gate and runs `check`, `test:db`, and `audit:prod`

DB smoke test notes:

- `npm run test:db` is not part of `npm run check` so the accepted local no-Docker workflow remains fast and Redis-free
- DB smoke tests read `DATABASE_URL_TEST` from the shell environment or local `.env`
- DB smoke tests are skipped when `DATABASE_URL_TEST` is not set
- if `DATABASE_URL_TEST` is set, its database name must contain `test`, for example `emotrack_test`
- the guard is intentional: DB smoke tests must never run against the normal local development database
- apply Prisma migrations to the test database before running DB smoke tests
- the smoke suite verifies real PostgreSQL behavior for repository connectivity, same-day `DailyEntry` uniqueness, metric catalog reads, and event overlap queries

Example PowerShell setup for an isolated local test database:

```powershell
$env:DATABASE_URL_TEST="postgresql://emotrack:emotrack@localhost:5432/emotrack_test?schema=public"
$env:DATABASE_URL=$env:DATABASE_URL_TEST
npx prisma migrate deploy
npm run test:db
```

## Terms and Access Notes

Current access behavior is explicit and mandatory:

- a new user must accept the user agreement before product usage
- the agreement is available through `/terms`
- before acceptance, product commands redirect into the consent flow instead of opening check-in, history, stats, or settings
- the existing `consentGiven` onboarding step remains the acceptance source of truth; this step was not redesigned into a separate legal subsystem
- after acceptance, onboarding offers daily reminder setup by time, but the user can defer it and still continue to the first check-in offer

## Telegram Commands

The bot now registers Telegram command hints through `setMyCommands` when the Telegram API is available.
Command names stay plain slash commands, while descriptions include icons so Telegram's command menu is easier to scan.

Current command list:

- `/start`
- `/menu`
- `/help`
- `/terms`
- `/checkin`
- `/event`
- `/history`
- `/stats`
- `/settings`

Runtime note:

- command registration is best-effort
- if Telegram command sync fails, startup continues and the bot still launches in the current mode
- Telegram command sync, webhook registration, and polling launch are bounded by `TELEGRAM_STARTUP_TIMEOUT_MS`; if Telegram API hangs, HTTP startup continues and readiness reports Telegram as failed
- local polling mode behavior is unchanged

## Telegram Navigation UX

Current navigation is split by frequency:

- the persistent bottom keyboard contains only `Отметить состояние` and `Добавить событие`
- `/menu` opens a formatted navigation screen with inline buttons for statistics, history, settings, help, and the user agreement
- `/menu` is registered as the second Telegram command after `/start`
- `/start` for an already onboarded user now opens the same inline navigation menu instead of only sending a passive ready-state message
- slash commands remain available for direct access to `/checkin`, `/event`, `/history`, `/stats`, `/settings`, `/help`, and `/terms`
- key bot messages use Telegram HTML formatting for clearer headings, separators, and hints
- safe callback-driven screens edit the current inline message where possible instead of appending duplicate messages; if Telegram cannot edit a stale message, the bot falls back to a normal reply
- callback flows that must return the persistent bottom keyboard safely delete the current inline message before sending one new menu/confirmation message
- cancel actions return the user to navigation instead of leaving a bare `Действие отменено` message
- active check-in/event prompts keep the last bot prompt `message_id` in the existing FSM payload, so text-input steps can best-effort delete the previous prompt and the user's input before showing the next prompt
- inline rows do not show `Отмена` next to `Назад`; when back navigation is available, the user sees the narrower back/continue path

## Onboarding UX Notes

Current first-run behavior is product-first:

- `/start` shows one concise intro explaining what the bot tracks, how check-ins, notes, and events differ, and what the first route will do
- consent is still required before saving user data
- accepting consent edits the current agreement/onboarding message into the reminder step where Telegram allows it
- after consent, the user is offered daily reminder setup by entering a time such as `21:30`
- reminder setup can be deferred with `Настрою позже`; in that case reminders are disabled until the user enables them in `/settings`
- after reminder setup or deferral, the bot immediately offers the first check-in for today
- if the user postpones the first check-in, the bot removes the inline offer where possible, shows the main menu, and explains history, stats, notes, events, and reminders
- after the first onboarding check-in is saved, the bot sends the normal save confirmation with the persistent bottom keyboard and immediately opens the inline navigation menu

## Check-in UX Notes

Current check-in behavior is intentionally conservative:

- `/checkin` resumes an active check-in instead of silently resetting progress
- `Back` is available on optional note/tag/event branches where the FSM supports it
- score-step prompts now make the active metric explicit in the bold step title, for example `Шаг 1/5 · Настроение`
- note copy explains that a note is free-form context attached to the daily check-in, while events are separate categorized facts
- score, skip, back, note, tag, and check-in event callbacks refresh the current inline screen where possible instead of producing a stack of prompts
- final confirmation from an inline check-in callback removes the previous inline screen before sending the saved-entry confirmation
- if a user returns to core sleep steps after already saving optional note/tag data in the same flow, the final confirmation still reflects that saved optional data
- final confirmation is compact and reports only values and optional data that were actually saved
- draft tag selections are not reported as saved until the user confirms them with `Готово`
- tag selection updates the existing inline message as tags are toggled, so the chat does not fill with duplicate tag prompts
- if the check-in FSM loses context, the user gets a safe restart message instead of a raw or ambiguous error
- same-day upsert behavior remains unchanged: one normalized day key, one `DailyEntry`

## Configurable Check-in

Configurable check-in now uses the catalog-backed tracked-metrics layer for the daily flow.

- `users` now store per-metric tracking flags:
  - `trackMood`
  - `trackEnergy`
  - `trackStress`
  - `trackSleep`
- `daily_entries.moodScore`
- `daily_entries.energyScore`
- `daily_entries.stressScore`
  are nullable in the schema so disabled metrics do not require fake zero values
- existing users keep the original effective behavior because all tracking flags default to `true`
- `/settings` shows a separate `Критерии check-in` submenu backed by `user_tracked_metrics`
- the submenu now exposes the current metric catalog used by the Telegram check-in flow:
  - mood
  - energy
  - stress
  - sleep
  - joy
  - sadness
  - anxiety
  - irritation
  - motivation
  - concentration
  - wellbeing
- the check-in flow builds its metric steps dynamically in a fixed order:
  - core metrics first:
    - mood
    - energy
    - stress
    - sleep
  - then enabled extra score metrics from the catalog
- sleep remains a dedicated block and still follows the current `sleepMode`
- a user must keep at least one daily metric enabled
- same-day update behavior stays patch-like:
  - only prompted metrics are updated
  - disabled metrics are not silently cleared from an existing same-day entry
- persistence is backward-compatible:
  - mood/energy/stress are dual-written to legacy `DailyEntry` fields and to `daily_entry_metric_values`
  - extra score metrics are written to `daily_entry_metric_values`
  - sleep stays in the legacy sleep fields for now

## Daily Metric Catalog Groundwork

The project includes a backward-compatible metric catalog layer that is now active for tracked-metric selection and generic score persistence.

- Prisma now stores:
  - `daily_metric_definitions`
  - `user_tracked_metrics`
  - `daily_entry_metric_values`
- the seeded metric catalog currently includes:
  - core metrics:
    - mood
    - energy
    - stress
    - sleep
  - additional score-based metrics:
    - joy
    - sadness
    - anxiety
    - irritation
    - motivation
    - concentration
    - wellbeing
- `UsersService` lazily syncs `user_tracked_metrics` for existing and new users so the catalog can be introduced without a destructive rollout
- the `Критерии check-in` submenu reads from `user_tracked_metrics` and keeps legacy core flags synchronized for backward compatibility
- `daily_entry_metric_values` is now actively used by the check-in flow for:
  - dual-write of core score metrics
  - storage of enabled extra score metrics
- saved extra score metrics are now visible again on the user-facing read-path:
  - `/history` renders them as a compact extra-metrics line per entry
  - `/stats` includes them in the text summary as averaged extra metrics
- historical extra-metric visibility no longer depends on the metric definition staying active in the catalog:
  - if an extra score was saved earlier, `/history` and `/stats` continue to show it even after that metric is later disabled or marked inactive
- charts still keep their accepted legacy metric set and are not expanded by generic catalog metrics in this step

## History UX Notes

Current `/history` behavior stays intentionally simple, but the Telegram text is formatted for scanning:

- the first page shows the most recent 5 entries in a compact Telegram-friendly layout
- each history row now includes an inline `Открыть` action for a full entry view
- each item shows a bold date, mood/energy/stress when present, sleep data when present, and an icon summary line for note, tags, and linked events
- if an entry contains saved extra score metrics, `/history` adds one compact formatted `Доп. метрики` line for them
- extra-only entries do not render a useless empty core placeholder line; the first meaningful metric line is shown instead
- opening an entry shows a detail view with:
  - all saved score metrics
  - sleep data
  - full note text
  - attached tags
  - overlapped events for that day
- the detail view uses clear section headings and hides empty note/tag/event sections instead of rendering placeholder dashes
- the detail view uses a single `К списку` action and returns to the same history page
- history day counts are overlap-aware for events: a multi-day event is counted on each day in its inclusive span
- older entries are loaded through a single inline `Еще` action
- `Еще` edits the same history message instead of appending duplicate history blocks
- history messages are sent with HTML parse mode and escape user-provided note, tag, event, and custom metric text before rendering
- stale `Еще` and stale `Открыть` callbacks degrade gracefully and ask the user to open `/history` again

## Event Model Notes

Current event behavior stays intentionally bounded:

- check-in-created events remain single-day only
- standalone `/event` supports:
  - a single-day event
  - an optional inclusive end date for a multi-day period event
- event flow uses `Далее` for optional description/end-date continuation, because the action means “continue without this optional detail”, not “cancel the event”
- event prompts with `Назад` do not also show `Отмена`; text-input steps best-effort remove the previous prompt and the user's submitted text before the next prompt
- legacy schema metadata for event series may still exist in the database, but repeated standalone event creation is currently disabled in the UI
- series-backed legacy rows are intentionally excluded from user-facing history and stats while the event UX is being simplified
- stats period reads are overlap-aware:
  - an event is included when its inclusive day span overlaps the selected period
- stats still count distinct event rows, not event-days

## Settings UX Notes

Current `/settings` behavior stays within the original scope, but is clearer about runtime state:

- after each settings update, the user is returned to the current settings screen
- settings callback actions refresh the current inline settings screen instead of sending a separate confirmation plus a new menu message
- settings screens no longer show generic `Отмена`; sleep mode and reminder-time editing use `Назад` for safe return to the main settings screen
- the settings screen shows reminder state, reminder time, weekly digest runtime status, sleep mode, tracked daily metrics, and whether background auto-reminders are actually available
- when jobs are disabled locally, reminder preferences are still saved, but the bot explicitly distinguishes between “settings saved” and “background delivery unavailable in this environment”
- tracked daily metrics are managed in a separate `Критерии check-in` submenu inside `/settings`
- that submenu is backed by `user_tracked_metrics`, while legacy core flags are kept synchronized so the current check-in flow remains stable
- the submenu now includes both core metrics and the currently supported extra score metrics from the catalog
- the submenu explicitly says that changing criteria affects future daily prompts only and does not rewrite historical entries
- the settings layer rejects configurations that would disable all daily metrics at once

## Stats Readability Notes

Current `/stats` behavior is now intentionally lightweight for Telegram:

- the flow is `period -> metric -> summary`
- after choosing a period, the user sees only the currently enabled metrics from the `Check-in criteria` submenu
- the metric selector explicitly positions Telegram stats as a light one-metric view; deeper analytics remain future web-panel scope
- the bot then shows a compact single-metric summary instead of a large all-in-one analytics screen
- this keeps Telegram stats useful and fast, while deeper analytics remain out of scope for the current bot UI
- stats selectors label the cancel action as `В меню` and return to the navigation menu by editing the current inline screen

Low-data contract:

- `0` entries in the selected period: empty-state message
- `1-2` entries in the selected period: preliminary text summary, no charts
- `3+` entries in the selected period: full selected-metric summary and chart sending

This threshold is explicit by design. It is only a presentation rule and does not change the underlying stats calculations.

Current selected-metric behavior:

- score metrics use a compact summary for the selected metric only
- sleep remains a dedicated special-case metric with sleep-specific counts and averages
- extra score metrics from `daily_entry_metric_values` are first-class options in the metric selector when they are enabled for the user
- if an extra score was saved earlier, it remains visible on the stats read-path even after that metric is later disabled or marked inactive
- the best/worst day block remains mood-based:
  - it is shown only when the selected metric is `mood` and mood data exists
  - it stays hidden for non-mood metrics and for mood periods without usable mood data
- comparison and pattern logic keep their accepted semantics and are not expanded into a broader analytics browser in this step

Current chart behavior:

- a selected score metric gets one single-metric line chart
- a selected sleep metric uses the existing sleep chart path
- selected chart captions now include both the metric and the chosen period
- extra-only datasets no longer try to send an empty legacy combined chart
- chart failure fallback is unchanged: the user still receives the text summary

Internal note:

- the `all-time` stats path now aggregates extra-metric averages at repository level instead of loading all generic metric values in memory only for summary formatting
- this is an internal optimization only; visible `/stats` semantics stay the same

Stage B comparison and pattern notes:

- `d7` and `d30` can show a compact comparison block versus the previous period
- `all-time` keeps the existing summary semantics and does not invent a previous-period comparison
- pattern blocks are intentionally conservative and are omitted when the data is sparse, tied, noisy, or weak
- current pattern set is limited to:
  - one sleep-to-state observation if the split is strong enough
  - one weekday mood tendency if repeated weekday data is clearly strong enough
- a minimal event companion note with the most frequent event type and at most one simple mood comparison
- low-data behavior from Stage A is unchanged: low-data summaries do not show comparison or pattern blocks

## Weekly Digest Notes

Current weekly digest behavior stays deliberately small and explicit:

- it reuses the accepted `d7` summary pipeline and wraps it with a weekly digest header
- it is delivered through the existing reminder path rather than a second summary system
- it is eligible only when:
  - onboarding is complete
  - reminders are enabled
  - reminder time is set
  - the last 7 normalized user-local days include at least 3 entries
- when the threshold is not met, the weekly digest is skipped instead of sending a weak summary
- when jobs are disabled, weekly digest scheduling and enqueueing degrade to safe no-op behavior

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

Error and warning logs now use stable searchable key-value events where practical:

- `event=telegram_route_failed`
- `event=telegram_fallback_reply_failed`
- `event=telegram_fsm_reset_after_error`
- `event=telegram_webhook_update_skipped`
- `event=telegram_webhook_update_failed`
- `event=stats_chart_generation_failed`
- `event=stats_selected_metric_chart_generation_failed`
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

Useful search examples:

```powershell
Select-String -Path .\logs\*.log -Pattern "event=telegram_route_failed"
Select-String -Path .\logs\*.log -Pattern "userId=<user-id>"
Select-String -Path .\logs\*.log -Pattern "routeKey=checkin"
```

Safety behavior:

- raw stack traces are not sent to Telegram users
- unexpected Telegram route failures are caught and degraded gracefully
- broken FSM sessions are reset to `idle`
- chart failures do not break `/stats`
- analytics persistence failures do not break user flows
- summary persistence failures do not break `/stats`
- stale or unknown stats metric callbacks re-open the metric selector instead of generating a summary for an unavailable metric

## Staging and Release Discipline

This repository does not include a full CI/CD pipeline or automatic rollback tooling.

Current Stage B operational discipline includes:

- lightweight health endpoints for smoke checks
- explicit local vs staging expectations
- manual release and rollback guidance

See:

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

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
- the combined chart now uses lightweight event-presence markers and subtle best/worst day point accents based on the existing stats payload
- an additional compact mood strip can be sent for normal datasets when it remains readable; it is intentionally skipped for dense periods
- low-data suppression, chart send order, and chart failure fallback behavior remain unchanged

## Manual QA Checklist

See the manual QA checklist here:

- [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md)

## Current Development Direction

The Telegram bot foundation is ready enough to move into the next controlled phase.

Current order of work:

1. deploy the current Telegram bot backend and PostgreSQL database to the server
2. verify server env, migrations, health checks, logs, backup, and rollback basics
3. add a web interface as a second client of the same backend and domain services
4. add shared AI analytics later as a common backend layer for both Telegram and web

The planned AI layer should not be Telegram-only. It should start as an isolated backend module/service boundary that consumes prepared analytics snapshots and can expose the same insights to Telegram and the future web interface.

See the detailed plan in:

- [docs/ROADMAP.md](docs/ROADMAP.md)

## Known MVP Limitations

- history navigation is intentionally simple and only supports sequential `Еще` loading
- no data export
- no account deletion flow yet
- no advanced reminder UI beyond current settings
- weekly digest uses the same d7 summary engine and does not yet have separate user-facing controls
- no AI insights layer
- no admin interface
- no production-grade observability stack yet

## Extension Points

Natural next steps after the MVP:

- broader settings coverage for optional modules
- richer weekly digest controls and cadence options
- export and privacy tooling
- richer analytics dashboards
- deployment manifests and production monitoring

## Optional Docker Path

`docker-compose.yml` remains available as an optional infrastructure path for PostgreSQL and Redis, but Docker is not required for local Windows development.



