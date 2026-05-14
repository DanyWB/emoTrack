# emoTrack Manual QA Checklist

Use this checklist before a local handoff or release candidate review.

## Environment

- `.env` is created from `.env.example`
- local PostgreSQL is running
- `npm run prisma:generate` completed
- `npm run prisma:migrate` completed
- `npm run prisma:seed` completed
- app starts with `npm run start:dev`
- if admin checks are needed, `ADMIN_TELEGRAM_IDS` contains the tester's numeric Telegram id

## Local Dev Safety

- app boots with `REDIS_ENABLED=false`
- app boots with `JOBS_ENABLED=false`
- setting `JOBS_ENABLED=true` in local `.env` is respected during BullMQ module wiring when Redis is configured
- polling mode works with `TELEGRAM_MODE=polling`
- startup does not require webhook variables in polling mode
- `GET /health/live` returns `200`
- `GET /health/ready` returns `200` with database `up` and Redis `skipped`
- `GET /health/ready` reports Telegram as `skipped` when the local placeholder bot token is used

## Webhook Mode

- with `TELEGRAM_MODE=webhook`, `TELEGRAM_WEBHOOK_URL` points to the public `POST /telegram/webhook` endpoint
- a webhook request with the configured `x-telegram-bot-api-secret-token` is dispatched into the bot router
- a webhook request with a wrong secret returns `401` and does not dispatch the update
- when the app is in polling mode, `POST /telegram/webhook` returns a skipped response and logs `event=telegram_webhook_update_skipped`

## Onboarding

- new user sends `/start`
- user sees one concise intro that explains the bot, the first route, and the medical disclaimer
- intro explains the difference between a check-in note and a separate event
- user sees explicit consent prompt
- `/terms` works before onboarding is complete
- `/terms` shows the agreement text and offers acceptance
- trying to open a product command before consent redirects back into the consent flow
- `Согласен` moves to daily reminder setup by editing the current agreement/onboarding message where Telegram allows it
- reminder setup offers `Настрою позже`
- invalid reminder time shows Russian validation error
- valid reminder time is saved
- choosing `Настрою позже` completes onboarding with reminders disabled, no reminder time, and no extra standalone “skipped” message
- onboarding completes
- first check-in offer is shown
- choosing `Начать check-in` and completing the first check-in shows the save confirmation and then immediately opens the inline navigation menu
- choosing `Позже` on the first check-in offer removes the inline offer where possible, shows the main menu, and explains the main benefits
- choosing `Позже` also opens the inline navigation menu after the explanatory message

## Existing User `/start`

- existing onboarded user sends `/start`
- bot shows concise ready-state response with inline navigation buttons for statistics, history, settings, help, and the user agreement
- bottom keyboard from the ready flow still contains only `Отметить состояние` and `Добавить событие`

## Navigation Menu

- `/menu` works for an onboarded user
- `/menu` is visually formatted with a clear heading, separator, and short navigation hint
- `/menu` shows inline buttons for statistics, history, settings, help, and the user agreement
- `📊 Статистика` opens the stats period selector by editing the current `/menu` message
- `📚 История` opens history by editing the current `/menu` message
- `⚙️ Настройки` opens settings by editing the current `/menu` message
- `❔ Помощь` opens help by editing the current `/menu` message
- `📄 Соглашение` opens the agreement from the menu
- product-only menu callbacks still redirect through consent/onboarding if the user is not ready

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
- `Отмена` clears active check-in flow safely and returns to navigation instead of only saying “cancelled”
- `Назад` works on multi-step check-in
- running `/checkin` during an active check-in resumes the current step instead of resetting progress
- check-in score prompts have bold step titles that name the active metric, such as `Шаг 1/5 · Настроение`
- tapping score/back/skip buttons refreshes the current inline check-in prompt where possible instead of adding a new prompt each time
- when `Назад` is available in a check-in/event prompt, the same inline row does not also show generic `Отмена`
- `Back` is available on the optional note prompt
- after going back from optional steps to sleep/core steps, already saved note/tag data is still reflected in the final confirmation
- invalid score input shows Russian validation error
- invalid sleep-hours input shows Russian validation error

## Configurable Check-in

- in `/settings`, open `Критерии check-in`
- verify that the submenu shows both core metrics and extra score metrics such as `Радость`
- verify that the submenu explains that changed criteria affect future daily prompts only and do not rewrite history
- disable `Энергия` and `Сон`
- `/checkin` now asks only for the remaining enabled metrics in the configured order
- enable `Радость`
- `/checkin` now includes an extra score step for `Радость` after the enabled core metrics
- final confirmation shows only the metrics that were actually tracked, including enabled extra score metrics
- when only one daily metric remains enabled, trying to disable it is rejected
- when the last remaining tracked metric is the current sleep step, `Пропустить` does not allow saving an empty entry
- after changing tracked metrics, the refreshed `Критерии check-in` screen shows the new current-state metric list

## Same-Day Upsert

- user completes a check-in
- user runs `/checkin` again on the same day
- existing `DailyEntry` is updated
- duplicate `DailyEntry` is not created
- if some core metrics were later disabled in `/settings`, a same-day re-check-in updates only the prompted metrics and keeps the old unprompted legacy values untouched
- if an extra score metric was recorded earlier in the day and later disabled in `Критерии check-in`, a same-day re-check-in keeps the old generic metric value untouched

## Optional Check-in Data

- note step accepts a valid text note
- note prompt explains that notes are free-form context attached to the daily check-in and gives a concrete example
- too-long note is rejected
- tag selection allows multi-select
- tapping tag buttons updates the existing tag-selection message instead of sending a new tag prompt each time
- if Telegram cannot edit the old tag-selection message, the bot falls back to one normal reply
- tag selection saves without duplicate relations
- skipping the tag-selection screen after selecting draft tags does not report those draft tags as saved
- event can be added from the check-in continuation
- final confirmation reflects optional data correctly
- when final confirmation is reached from an inline check-in callback, the previous inline prompt is removed where Telegram allows it
- final confirmation stays compact and only lists saved/tracked values

## Standalone Event

- `/event` starts event flow
- valid event type can be selected
- title is required
- invalid title is rejected
- after sending a valid event title, the previous title prompt and the user's title message are removed where Telegram allows it
- score must be 0..10
- optional description uses the `Далее` button instead of `Пропустить`
- valid standalone event is saved successfully
- standalone event can be saved without an end date and remains single-day
- optional end-date continuation uses the `Далее` button instead of `Пропустить`
- standalone event can be saved with an inclusive end date for a bounded multi-day period
- end date earlier than start date is rejected
- check-in-created event remains single-day only

## History

- `/history` works for a user with entries
- entries are ordered descending by date
- the first history page stays compact and readable in Telegram
- each history item shows a bold date and mood/energy/stress when present
- sleep data appears when present
- if an entry has saved extra score metrics, `/history` shows a compact `Доп. метрики` line for them
- extra score metrics remain visible in `/history` even if their metric definition was later marked inactive
- an extra-only history entry does not show the empty legacy core placeholder line
- history list items use a compact summary line for note, tags, and linked events
- opening a history entry shows clearly separated sections for state, sleep, full note text, tags, extra metrics, and day events
- empty note/tag/event sections are hidden in the detail view instead of showing placeholder dashes
- the detail view can return to the same history page without duplicating messages
- stale `Открыть` callbacks degrade gracefully back to the regular history entry point
- a multi-day standalone event is counted on each overlapped history day
- legacy series-backed rows are ignored in user-facing history day counts
- when more than 5 entries exist, `Еще` loads older entries
- `Еще` edits the same history message instead of sending duplicated history blocks
- empty history state is handled gracefully

## Stats and Summaries

- `/stats` opens period selector
- after choosing a period, `/stats` opens a metric selector by editing the current selector message instead of sending a combined all-metrics summary immediately
- `В меню` from the period or metric selector returns to `/menu` by editing the current stats message
- the metric selector shows only the user's enabled metrics from the `Check-in criteria` submenu
- the metric selector shows the light-stats helper text about one metric at a time
- stale or unknown stats metric callbacks re-open the metric selector and do not generate a summary
- selecting an enabled score metric returns a single-metric summary text
- selecting `sleep` returns the sleep-specific summary text
- empty-data state is handled gracefully
- with 1-2 entries, `/stats` returns a preliminary low-data summary without charts
- with 3 or more entries, `/stats` returns the full selected-metric summary path
- the selected summary includes counts and averages for that metric only
- extra score metrics remain visible in `/stats` even if their metric definition was later marked inactive
- extra score metrics remain visible in `/stats` even if they were later disabled in the `Check-in criteria` submenu
- an extra-only user can still complete the full `/stats` flow for an enabled extra metric
- a mood-only stats dataset still shows the best/worst day block when `mood` is selected
- when the selected metric is not `mood`, the best/worst day block stays hidden
- when a stats period has no mood data, the best/worst day block stays hidden
- for `7 days` and `30 days`, a previous-period comparison block appears only when the selected metric and period are not low-data
- the comparison block is omitted when the previous period has no usable data
- pattern blocks appear only when the dataset is clearly strong enough
- weak or tied signals do not produce a pattern block
- low-data summaries do not show comparison or pattern blocks
- stats event count includes a multi-day event when its inclusive span overlaps the selected period
- stats event count ignores legacy series-backed rows

## Charts

- selecting a score metric sends one single-metric line chart when there is enough data
- selecting `sleep` sends the existing sleep chart when sleep data exists
- selected chart captions include both the metric and the chosen period
- an extra-only stats dataset does not send an empty legacy combined chart
- a sleep-only or sleep-plus-extra dataset can still send the sleep chart
- compact mood strip is sent only when the dataset stays readable and is not overly dense
- charts are skipped for low-data periods with fewer than 3 entries
- on a normal `3-5` entry dataset, the selected-metric chart remains readable
- on longer periods, x-axis labels stay readable and do not become overly dense
- chart rendering failure does not break stats flow
- user still receives text summary when chart generation fails

## Settings

- `/settings` opens settings menu
- current settings screen shows reminder state, reminder time, weekly digest runtime status, sleep mode, tracked daily metrics, and current auto-reminder runtime status
- `Критерии check-in` opens as a separate submenu from the main settings screen
- settings submenu buttons refresh the current inline settings message where possible
- opening the submenu lazily syncs `user_tracked_metrics` if they are missing for the user
- the submenu can enable and disable both core metrics and supported extra score metrics
- trying to disable the last remaining daily metric shows the generic guard text `Нужно оставить хотя бы одну ежедневную метрику.`
- reminders can be toggled on and off
- enabling reminders with `JOBS_ENABLED=false` keeps settings saved but does not imply background delivery is active
- reminder time can be updated
- invalid reminder time is rejected
- delivered daily reminder text is readable and includes the polished emoji/check-in call to action
- reminder-time editing uses `Назад`, not generic `Отмена`
- after a valid reminder time update, the refreshed settings screen is shown again
- reminder messages distinguish between “saved” and “background delivery unavailable in this environment”
- weekly digest is described as using the same reminder path and staying unavailable when jobs are disabled
- sleep mode can be changed to `hours`
- sleep mode can be changed to `quality`
- sleep mode can be changed to `both`
- the sleep-mode submenu has `Назад` and does not show generic `Отмена`
- `Назад` from the metric submenu returns to the main settings screen
- after each settings change, the user returns to a clear current-state settings screen

## Help

- `/help` works
- `/help` works before consent is accepted
- help text is concise
- help text points users to `/menu` for navigation
- help text includes `/terms`
- help text states that the bot is not a diagnostic or medical tool

## Admin Panel

- `/admin` is not listed in the public Telegram command hints, but the router accepts it
- a Telegram id not present in `ADMIN_TELEGRAM_IDS` receives the access-denied message
- a configured admin id opens the admin menu
- `Общая статистика` shows total users, consented users, onboarded users, active users, check-ins, events, recent 7-day activity, and reminder-enabled users
- `Активные пользователи` lists only users with at least one saved check-in
- active users list pagination works when there are more than 5 active users
- opening an active user shows Telegram identity, timezone, onboarding/consent state, reminder state, first/last check-in dates, check-in count, event count, and summary count
- user stats buttons for 7 days, 30 days, and all time generate the existing summary text for that target user
- when the target user has enough data, admin stats also send the existing chart images
- history opens for the target user and entry details show full notes, tags, extra metrics, and day events
- admin callbacks work even if the admin account has not completed normal onboarding

## Telegram Commands

- Telegram command hints are registered for `/start`, `/menu`, `/help`, `/terms`, `/checkin`, `/event`, `/history`, `/stats`, and `/settings`
- `/menu` is the second command in the Telegram command list
- command descriptions in Telegram's command menu include distinct icons
- if Telegram command sync fails, app startup still continues

## Optional Jobs Path

Run this section only when Redis is available and enabled.

- app boots with `REDIS_ENABLED=true`
- app boots with `JOBS_ENABLED=true`
- reminder scheduling does not crash startup
- startup reconciles repeatable daily reminder and weekly digest jobs for users with completed onboarding, enabled reminders, and a saved reminder time
- per-user reconciliation failures log `event=reminder_job_reconcile_failed` and do not stop the remaining eligible users from being attempted
- invalid persisted reminder times remove stale repeatable reminder and weekly digest jobs before the user is skipped
- disabling reminders cancels scheduling path cleanly
- `GET /health/ready` returns `200` and includes Redis `up`

## Weekly Digest

- with `REDIS_ENABLED=true` and `JOBS_ENABLED=true`, weekly digest scheduling does not crash startup
- weekly digest reuses the existing 7-day summary path instead of a separate stats engine
- weekly digest is sent only when the last 7 normalized user-local days include at least 3 entries
- with fewer than 3 entries in the last 7 days, weekly digest is skipped
- weekly digest stays disabled safely when jobs are unavailable locally
- daily reminder behavior remains unchanged after weekly digest support is enabled

## Optional DB Smoke Tests

Run this section only when an isolated local PostgreSQL test database is available.

- `DATABASE_URL_TEST` points to a separate database, for example `emotrack_test`
- `DATABASE_URL_TEST` is available either in the shell environment or local `.env`
- the test database name contains `test`
- Prisma migrations were applied to the test database before running the smoke suite
- `npm run test:db` passes when `DATABASE_URL_TEST` is configured
- with no `DATABASE_URL_TEST`, `npm run test:db` skips the DB smoke suite instead of requiring Docker or PostgreSQL setup
- the DB smoke suite verifies repository connectivity, same-day `DailyEntry` uniqueness, metric catalog reads, active-reminder user reads, and inclusive event overlap queries

## Logging Checks

- error and warning logs use searchable `event=...` keys for critical failure paths
- webhook failures and skipped webhook updates include `event=telegram_webhook_update_failed` or `event=telegram_webhook_update_skipped`
- Telegram route failures include `event=telegram_route_failed`, `routeKey`, `userId` when known, and `fsmState` when available
- when a real Telegram bot runtime fails to launch or register webhook, `GET /health/ready` returns Telegram `down`
- chart failures include stats/chart context and still return a text summary to the user
- readiness failures include `event=readiness_database_check_failed` or `event=readiness_redis_check_failed`
- reminder startup reconciliation logs `event=reminder_jobs_reconciled` and per-user failures log `event=reminder_job_reconcile_failed`
- user-facing Telegram errors stay generic and do not expose raw stack traces
- Jest mutes routine `Logger.log`, `Logger.debug`, and `Logger.verbose` output, while warnings and errors remain visible unless a test explicitly spies on them

## Final Verification

- `npm run lint` passes
- `npm run build` passes
- `npm test` passes
- `npm run test:unit` passes when only unit-level feedback is needed
- `npm run test:integration` passes when critical in-memory integration flows are being reviewed
- router contract coverage is included in `npm run test:integration` for Telegram route registration, callback guards, stale callback recovery, and route-error fallback
- `npm run test:db` passes or skips clearly depending on `DATABASE_URL_TEST`
- `npm run test:coverage` passes and respects the configured global coverage baseline
- `npm run audit:prod` passes with no production vulnerabilities
- `npm run check` passes before handoff when a full local gate is needed
- `npm run verify` passes before release/handoff when DB smoke tests are available
- release/runbook docs were reviewed before handoff

## Daily Metric Catalog Groundwork

- `npm run prisma:migrate` creates:
  - `daily_metric_definitions`
  - `user_tracked_metrics`
  - `daily_entry_metric_values`
- `npm run prisma:seed` populates the daily metric catalog idempotently
- a newly created or freshly loaded user gets `user_tracked_metrics` rows lazily through the service layer
- current Telegram UX still behaves like the accepted core-metric toggle flow and does not yet expose the full metric catalog directly
