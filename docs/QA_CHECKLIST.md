# emoTrack Manual QA Checklist

Use this checklist before a local handoff or release candidate review.

## Environment

- `.env` is created from `.env.example`
- local PostgreSQL is running
- `npm run prisma:generate` completed
- `npm run prisma:migrate` completed
- `npm run prisma:seed` completed
- app starts with `npm run start:dev`

## Local Dev Safety

- app boots with `REDIS_ENABLED=false`
- app boots with `JOBS_ENABLED=false`
- polling mode works with `TELEGRAM_MODE=polling`
- startup does not require webhook variables in polling mode
- `GET /health/live` returns `200`
- `GET /health/ready` returns `200` with database `up` and Redis `skipped`

## Onboarding

- new user sends `/start`
- user sees intro and disclaimer
- user sees explicit consent prompt
- `Р В Р’В Р В Р вЂ№Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦` moves to reminder time input
- invalid reminder time shows Russian validation error
- valid reminder time is saved
- onboarding completes
- first check-in offer is shown

## Existing User `/start`

- existing onboarded user sends `/start`
- bot shows concise ready-state response
- main menu is shown

## Check-in by Sleep Mode

### Sleep Mode: `hours`

- `/checkin` asks for mood
- asks for energy
- asks for stress
- asks only for sleep hours
- check-in can be completed successfully

### Sleep Mode: `quality`

- `/checkin` asks for mood
- asks for energy
- asks for stress
- asks only for sleep quality
- check-in can be completed successfully

### Sleep Mode: `both`

- `/checkin` asks for mood
- asks for energy
- asks for stress
- asks for sleep hours
- asks for sleep quality
- check-in can be completed successfully

## Check-in Navigation

- `Р В Р’В Р РЋРІР‚С”Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°` clears active onboarding flow safely
- `Р В Р’В Р РЋРІР‚С”Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°` clears active check-in flow safely
- `Р В Р’В Р РЋРЎС™Р В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р’В Р СћРІР‚В` works on multi-step check-in
- running `/checkin` during an active check-in resumes the current step instead of resetting progress
- `Back` is available on the optional note prompt
- after going back from optional steps to sleep/core steps, already saved note/tag data is still reflected in the final confirmation
- invalid score input shows Russian validation error
- invalid sleep-hours input shows Russian validation error

## Configurable Check-in

- in `/settings`, disable `Р­РЅРµСЂРіРёСЏ` and `РЎРѕРЅ`
- `/checkin` now asks only for the enabled core metrics in the original order
- final confirmation shows only the metrics that were actually tracked
- when only one core metric remains enabled, trying to disable it is rejected
- when the last remaining tracked metric is the current sleep step, `РџСЂРѕРїСѓСЃС‚РёС‚СЊ` does not allow saving an empty entry
- after changing tracked metrics, the refreshed settings screen shows the new daily metric summary

## Same-Day Upsert

- user completes a check-in
- user runs `/checkin` again on the same day
- existing `DailyEntry` is updated
- duplicate `DailyEntry` is not created
- if some core metrics were later disabled in `/settings`, a same-day re-check-in updates only the prompted metrics and keeps the old unprompted values untouched

## Optional Check-in Data

- note step accepts a valid text note
- too-long note is rejected
- tag selection allows multi-select
- tag selection saves without duplicate relations
- event can be added from the check-in continuation
- final confirmation reflects optional data correctly

## Standalone Event

- `/event` starts event flow
- valid event type can be selected
- title is required
- invalid title is rejected
- score must be 0..10
- description can be skipped
- valid standalone event is saved successfully
- standalone event can be saved without an end date and remains single-day
- standalone event can be saved with an inclusive end date for a bounded multi-day period
- end date earlier than start date is rejected
- check-in-created event remains single-day only

## History

- `/history` works for a user with entries
- entries are ordered descending by date
- the first history page stays compact and readable in Telegram
- each history item shows mood/energy/stress
- sleep data appears when present
- note marker appears when note exists
- linked event count appears when events exist
- a multi-day standalone event is counted on each overlapped history day
- legacy series-backed rows are ignored in user-facing history day counts
- when more than 5 entries exist, `Р В Р’В Р Р†Р вЂљРЎС›Р В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р вЂ™Р’Вµ` loads older entries
- `Р В Р’В Р Р†Р вЂљРЎС›Р В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р вЂ™Р’Вµ` edits the same history message instead of sending duplicated history blocks
- empty history state is handled gracefully

## Stats and Summaries

- `/stats` opens period selector
- `7 Р В Р’В Р СћРІР‚ВР В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’ВµР В Р’В Р Р†РІР‚С›РІР‚вЂњ` returns summary text
- `30 Р В Р’В Р СћРІР‚ВР В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’ВµР В Р’В Р Р†РІР‚С›РІР‚вЂњ` returns summary text
- `Р В Р’В Р Р†Р вЂљРІР‚СњР В Р’В Р вЂ™Р’В° Р В Р’В Р В РІР‚В Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р В РІР‚В Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋР’ВР В Р Р‹Р В Р РЏ` returns summary text
- empty-data state is handled gracefully
- with 1-2 entries, `/stats` returns a preliminary low-data summary without charts
- with 3 or more entries, `/stats` returns the full summary path
- summary includes counts and averages
- best/worst day lines are shown when data exists
- for `7 days` and `30 days`, a previous-period comparison block appears only when the period is not low-data
- the comparison block is omitted when the previous period has no usable data
- pattern blocks appear only when the dataset is clearly strong enough
- weak or tied signals do not produce a pattern block
- low-data summaries do not show comparison or pattern blocks
- stats event count includes a multi-day event when its inclusive span overlaps the selected period
- stats event count ignores legacy series-backed rows

## Charts

- combined mood/energy/stress chart is sent when data exists
- sleep chart is sent when sleep data exists

- compact mood strip is sent only when the dataset stays readable and is not overly dense
- charts are skipped for low-data periods with fewer than 3 entries
- on a normal `3-5` entry dataset, point markers and lines remain readable
- on longer periods, x-axis labels stay readable and do not become overly dense
- event-day markers appear on the combined chart without turning into a separate event analytics view
- best/worst day accents on the combined chart stay lightweight and do not clutter the plot
- chart rendering failure does not break stats flow
- user still receives text summary when chart generation fails

## Settings

- `/settings` opens settings menu
- current settings screen shows reminder state, reminder time, sleep mode, tracked daily metrics, and current auto-reminder runtime status
- reminders can be toggled on/off
- enabling reminders with `JOBS_ENABLED=false` keeps settings saved but does not imply background delivery is active
- reminder time can be updated
- invalid reminder time is rejected
- after a valid reminder time update, the refreshed settings screen is shown again
- sleep mode can be changed to `hours`
- sleep mode can be changed to `quality`
- sleep mode can be changed to `both`
- daily metric toggles can enable/disable mood, energy, stress, and sleep directly from the settings screen
- after each settings change, the user returns to a clear current-state settings screen

## Help

- `/help` works
- help text is concise
- help text states that the bot is not a diagnostic or medical tool

## Optional Jobs Path

Run this section only when Redis is available and enabled.

- app boots with `REDIS_ENABLED=true`
- app boots with `JOBS_ENABLED=true`
- reminder scheduling does not crash startup
- disabling reminders cancels scheduling path cleanly
- `GET /health/ready` returns `200` and includes Redis `up`

## Weekly Digest

- with `REDIS_ENABLED=true` and `JOBS_ENABLED=true`, weekly digest scheduling does not crash startup
- weekly digest reuses the existing 7-day summary path instead of a separate stats engine
- weekly digest is sent only when the last 7 normalized user-local days include at least 3 entries
- with fewer than 3 entries in the last 7 days, weekly digest is skipped
- weekly digest stays disabled safely when jobs are unavailable locally
- daily reminder behavior remains unchanged after weekly digest support is enabled

## Final Verification

- `npm run lint` passes
- `npm run build` passes
- `npm test` passes
- release/runbook docs were reviewed before handoff

## Daily Metric Catalog Groundwork

- `npm run prisma:migrate` creates:
  - `daily_metric_definitions`
  - `user_tracked_metrics`
  - `daily_entry_metric_values`
- `npm run prisma:seed` populates the daily metric catalog idempotently
- a newly created or freshly loaded user gets `user_tracked_metrics` rows lazily through the service layer
- current Telegram UX still behaves like the accepted core-metric toggle flow and does not yet expose the full metric catalog directly

