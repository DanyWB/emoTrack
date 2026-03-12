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

## Onboarding

- new user sends `/start`
- user sees intro and disclaimer
- user sees explicit consent prompt
- `Согласен` moves to reminder time input
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

- `Отмена` clears active onboarding flow safely
- `Отмена` clears active check-in flow safely
- `Назад` works on multi-step check-in
- running `/checkin` during an active check-in resumes the current step instead of resetting progress
- `Back` is available on the optional note prompt
- after going back from optional steps to sleep/core steps, already saved note/tag data is still reflected in the final confirmation
- invalid score input shows Russian validation error
- invalid sleep-hours input shows Russian validation error

## Same-Day Upsert

- user completes a check-in
- user runs `/checkin` again on the same day
- existing `DailyEntry` is updated
- duplicate `DailyEntry` is not created

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

## History

- `/history` works for a user with entries
- entries are ordered descending by date
- each history item shows mood/energy/stress
- sleep data appears when present
- note marker appears when note exists
- linked event count appears when events exist
- empty history state is handled gracefully

## Stats and Summaries

- `/stats` opens period selector
- `7 дней` returns summary text
- `30 дней` returns summary text
- `За всё время` returns summary text
- empty-data state is handled gracefully
- summary includes counts and averages
- best/worst day lines are shown when data exists

## Charts

- combined mood/energy/stress chart is sent when data exists
- sleep chart is sent when sleep data exists
- chart rendering failure does not break stats flow
- user still receives text summary when chart generation fails

## Settings

- `/settings` opens settings menu
- reminders can be toggled on/off
- reminder time can be updated
- invalid reminder time is rejected
- sleep mode can be changed to `hours`
- sleep mode can be changed to `quality`
- sleep mode can be changed to `both`

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

## Final Verification

- `npm run lint` passes
- `npm run build` passes
- `npm test` passes
