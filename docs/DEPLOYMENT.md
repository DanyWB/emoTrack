# emoTrack Deployment and Release Notes

This document is intentionally practical and conservative.

It does not describe a full CI/CD system because this repository does not include one.
It documents the current recommended manual staging and release discipline.

## Scope and Guarantees

Current operational support includes:

- local Windows no-Docker development
- optional Redis/jobs wiring
- polling mode for local development
- webhook mode for deployed environments when configured
- health endpoints for liveness and readiness checks

This repository does not currently provide:

- automated deployment pipelines
- automated rollback scripts
- automatic migration rollback
- production-grade observability tooling

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
- PostgreSQL available
- Redis enabled if reminder jobs or weekly digests must be exercised

These are recommendations, not hard-enforced deployment rules.

### Production

Recommended production shape:

- `NODE_ENV=production`
- `TELEGRAM_MODE=webhook`
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
   - `npm run lint`
   - `npm run build`
   - `npm test`
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
9. If webhook mode is used, verify Telegram webhook configuration.
10. Run one minimal product smoke path:
   - `/start` or `/help`

## Post-Deploy Smoke Checks

Recommended minimum checks:

1. `GET /health/live` returns `200`
2. `GET /health/ready` returns `200`
3. Telegram bot responds in the expected mode:
   - polling locally
   - webhook in deployed environments
4. If Redis/jobs are enabled:
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
- the current daily-metric catalog groundwork migration is also additive:
  - `daily_metric_definitions` stores the available catalog of score-based and sleep-block metrics
  - `user_tracked_metrics` stores per-user metric selection groundwork
  - `daily_entry_metric_values` stores generic per-entry metric values groundwork
  - the seeded catalog is idempotent and includes the current core metrics plus additional score-based metrics for future configurable check-in expansion
  - the current Telegram UX still uses the accepted core-metric toggle flow; these new tables are groundwork and do not yet replace the current user-facing flow
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
