# Check-in v2 Migration Notes

Check-in v2 is an additive product/data migration. It makes normalized metric storage the primary write/read model while keeping old `daily_entries` numeric fields for transition.

## What Changed

- New tables:
  - `daily_entry_v2_metric_values`
  - `daily_entry_v2_metric_tags`
  - `user_metric_preferences`
- New user flag:
  - `users.checkinV2OnboardingCompleted`
- Legacy `sleepQuality` values are converted from the old 1..10-style value into ordinal 1..5.
- The `daily_entries.sleepQuality` check constraint is tightened to reject values outside 1..5 after the conversion.
- Legacy mood and energy are mapped to 1..5.
- Legacy stress is reversed into calm:
  - stress 1-2 -> calm 5
  - stress 3-4 -> calm 4
  - stress 5-6 -> calm 3
  - stress 7-8 -> calm 2
- stress 9-10 -> calm 1
- Existing optional preferences are preserved where the old catalog has matching meanings:
  - `motivation` or `motivation_score` -> `motivation`
  - `wellbeing` -> `overall_state`
  - `concentration` -> `clarity`

## Why

The new product model uses semantic metric scales, metric-scoped tags, immutable core metrics, and optional metric preferences. Keeping definitions in code avoids catalog drift, while normalized rows make history, stats, charts, summaries, and future analytics easier to reason about.

## Local Migration

For local Windows development:

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

The Prisma migration `20260524152000_add_checkin_v2_product_model` performs the schema change and backfill.

## Server Migration

Before applying to a non-local database, take a PostgreSQL backup.

Then deploy migrations with the production Prisma command:

```bash
npx prisma migrate deploy
npm run prisma:generate
npm run prisma:seed
```

Do not run `prisma migrate dev` against production.

## Verification SQL

After migration, these checks should return sensible non-zero counts on a database with existing check-ins:

```sql
select count(*) from daily_entry_v2_metric_values;
select count(*) from user_metric_preferences;

select metric_key, count(*)
from daily_entry_v2_metric_values
group by metric_key
order by metric_key;

select metric_key, enabled, count(*)
from user_metric_preferences
group by metric_key, enabled
order by metric_key, enabled;
```

Check for invalid values:

```sql
select count(*)
from daily_entry_v2_metric_values
where ordinal_value < 1 or ordinal_value > 5;

select count(*)
from daily_entries
where sleep_quality is not null
  and (sleep_quality < 1 or sleep_quality > 5);
```

Both invalid-value queries should return `0`.

## Rollback Notes

This migration is additive except for converting `daily_entries.sleepQuality` to 1..5. If a rollback is needed, restore from backup or apply a corrective migration. Do not drop legacy numeric columns until the v2 read/write path has been stable in production.

## Runtime Verification

- `/checkin` shows semantic metric buttons and per-metric tags.
- Existing users see Check-in v2 onboarding before their next `/checkin`.
- `/settings` shows immutable core metrics, optional toggles, and sleep separately.
- Repeating today's check-in after disabling an optional metric removes that optional metric from the refreshed same-day v2 metric set.
- `/history` shows metric-scoped v2 tag details in entry detail, avoids duplicate backfilled optional metrics, and keeps old legacy-only tags visible separately.
- `/stats`, summaries, charts, and weekly digest still work for old and new entries, with `calm` treated as higher-is-better.
- `npm run build`, `npm run lint`, and `npm test -- --runInBand` pass.

## Follow-up Tag Catalog Patch

The follow-up Check-in v2 tag catalog patch changes code-defined labels and metadata only. It does not add a Prisma migration and does not require any manual SQL after the main Check-in v2 migration has already been applied.

What changed:

- every state metric has an unclear/uncertain tag option;
- `Настроение` keeps `игривое`;
- `Энергия` uses `непонятно` instead of more ambiguous wording such as `нервная энергия`;
- `Спокойствие` no longer offers duplicate scale wording like `спокойно`;
- `Ясность головы` no longer offers duplicate scale wording like `ясно` or `туманно`;
- motivation tags keep the more analytical wording such as `прокрастинация`, `избегание`, and `сопротивление`.

Deployment impact:

- no database migration;
- no seed change;
- restart the application after deploying the code;
- old saved `tagKey` rows remain valid because existing keys were preserved where practical.
