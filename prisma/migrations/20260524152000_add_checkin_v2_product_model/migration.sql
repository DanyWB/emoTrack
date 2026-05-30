-- Check-in v2 product model.
-- This migration is intentionally additive for legacy check-in data, then backfills
-- the new normalized tables so read paths can switch safely.

ALTER TABLE "users"
ADD COLUMN "checkinV2OnboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "user_metric_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_metric_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "daily_entry_v2_metric_values" (
    "id" TEXT NOT NULL,
    "dailyEntryId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "ordinalValue" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_entry_v2_metric_values_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "daily_entry_v2_metric_values_ordinal_check" CHECK ("ordinalValue" BETWEEN 1 AND 5)
);

CREATE TABLE "daily_entry_v2_metric_tags" (
    "id" TEXT NOT NULL,
    "dailyEntryMetricValueId" TEXT NOT NULL,
    "tagKey" TEXT NOT NULL,

    CONSTRAINT "daily_entry_v2_metric_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_metric_preferences_userId_metricKey_key"
ON "user_metric_preferences"("userId", "metricKey");

CREATE INDEX "user_metric_preferences_userId_enabled_sortOrder_idx"
ON "user_metric_preferences"("userId", "enabled", "sortOrder");

CREATE UNIQUE INDEX "daily_entry_v2_metric_values_dailyEntryId_metricKey_key"
ON "daily_entry_v2_metric_values"("dailyEntryId", "metricKey");

CREATE INDEX "daily_entry_v2_metric_values_metricKey_dailyEntryId_idx"
ON "daily_entry_v2_metric_values"("metricKey", "dailyEntryId");

CREATE UNIQUE INDEX "daily_entry_v2_metric_tags_dailyEntryMetricValueId_tagKey_key"
ON "daily_entry_v2_metric_tags"("dailyEntryMetricValueId", "tagKey");

ALTER TABLE "user_metric_preferences"
ADD CONSTRAINT "user_metric_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "daily_entry_v2_metric_values"
ADD CONSTRAINT "daily_entry_v2_metric_values_dailyEntryId_fkey"
FOREIGN KEY ("dailyEntryId") REFERENCES "daily_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "daily_entry_v2_metric_tags"
ADD CONSTRAINT "daily_entry_v2_metric_tags_dailyEntryMetricValueId_fkey"
FOREIGN KEY ("dailyEntryMetricValueId") REFERENCES "daily_entry_v2_metric_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "user_metric_preferences" ("id", "userId", "metricKey", "enabled", "sortOrder", "updatedAt")
SELECT "id" || ':pref:mood', "id", 'mood', true, 10, CURRENT_TIMESTAMP FROM "users"
ON CONFLICT ("userId", "metricKey") DO NOTHING;

INSERT INTO "user_metric_preferences" ("id", "userId", "metricKey", "enabled", "sortOrder", "updatedAt")
SELECT "id" || ':pref:energy', "id", 'energy', true, 20, CURRENT_TIMESTAMP FROM "users"
ON CONFLICT ("userId", "metricKey") DO NOTHING;

INSERT INTO "user_metric_preferences" ("id", "userId", "metricKey", "enabled", "sortOrder", "updatedAt")
SELECT "id" || ':pref:calm', "id", 'calm', true, 30, CURRENT_TIMESTAMP FROM "users"
ON CONFLICT ("userId", "metricKey") DO NOTHING;

INSERT INTO "user_metric_preferences" ("id", "userId", "metricKey", "enabled", "sortOrder", "updatedAt")
SELECT
  u."id" || ':pref:motivation',
  u."id",
  'motivation',
  COALESCE((
    SELECT utm."isEnabled"
    FROM "user_tracked_metrics" utm
    JOIN "daily_metric_definitions" dmd ON dmd."id" = utm."metricDefinitionId"
    WHERE utm."userId" = u."id" AND dmd."key" IN ('motivation', 'motivation_score')
    ORDER BY dmd."key"
    LIMIT 1
  ), true),
  40,
  CURRENT_TIMESTAMP
FROM "users" u
ON CONFLICT ("userId", "metricKey") DO NOTHING;

INSERT INTO "user_metric_preferences" ("id", "userId", "metricKey", "enabled", "sortOrder", "updatedAt")
SELECT
  u."id" || ':pref:overall_state',
  u."id",
  'overall_state',
  COALESCE((
    SELECT utm."isEnabled"
    FROM "user_tracked_metrics" utm
    JOIN "daily_metric_definitions" dmd ON dmd."id" = utm."metricDefinitionId"
    WHERE utm."userId" = u."id" AND dmd."key" = 'wellbeing'
    LIMIT 1
  ), true),
  50,
  CURRENT_TIMESTAMP
FROM "users" u
ON CONFLICT ("userId", "metricKey") DO NOTHING;

INSERT INTO "user_metric_preferences" ("id", "userId", "metricKey", "enabled", "sortOrder", "updatedAt")
SELECT
  u."id" || ':pref:clarity',
  u."id",
  'clarity',
  EXISTS (
    SELECT 1
    FROM "user_tracked_metrics" utm
    JOIN "daily_metric_definitions" dmd ON dmd."id" = utm."metricDefinitionId"
    WHERE utm."userId" = u."id" AND dmd."key" = 'concentration' AND utm."isEnabled" = true
  ),
  60,
  CURRENT_TIMESTAMP
FROM "users" u
ON CONFLICT ("userId", "metricKey") DO NOTHING;

INSERT INTO "user_metric_preferences" ("id", "userId", "metricKey", "enabled", "sortOrder", "updatedAt")
SELECT "id" || ':pref:social', "id", 'social', false, 70, CURRENT_TIMESTAMP FROM "users"
ON CONFLICT ("userId", "metricKey") DO NOTHING;

INSERT INTO "user_metric_preferences" ("id", "userId", "metricKey", "enabled", "sortOrder", "updatedAt")
SELECT "id" || ':pref:physical_state', "id", 'physical_state', false, 80, CURRENT_TIMESTAMP FROM "users"
ON CONFLICT ("userId", "metricKey") DO NOTHING;

INSERT INTO "daily_entry_v2_metric_values" ("id", "dailyEntryId", "metricKey", "ordinalValue", "createdAt", "updatedAt")
SELECT
  "id" || ':mood',
  "id",
  'mood',
  CASE
    WHEN "moodScore" <= 2 THEN 1
    WHEN "moodScore" <= 4 THEN 2
    WHEN "moodScore" <= 6 THEN 3
    WHEN "moodScore" <= 8 THEN 4
    ELSE 5
  END,
  "createdAt",
  CURRENT_TIMESTAMP
FROM "daily_entries"
WHERE "moodScore" IS NOT NULL
ON CONFLICT ("dailyEntryId", "metricKey") DO NOTHING;

INSERT INTO "daily_entry_v2_metric_values" ("id", "dailyEntryId", "metricKey", "ordinalValue", "createdAt", "updatedAt")
SELECT
  "id" || ':energy',
  "id",
  'energy',
  CASE
    WHEN "energyScore" <= 2 THEN 1
    WHEN "energyScore" <= 4 THEN 2
    WHEN "energyScore" <= 6 THEN 3
    WHEN "energyScore" <= 8 THEN 4
    ELSE 5
  END,
  "createdAt",
  CURRENT_TIMESTAMP
FROM "daily_entries"
WHERE "energyScore" IS NOT NULL
ON CONFLICT ("dailyEntryId", "metricKey") DO NOTHING;

INSERT INTO "daily_entry_v2_metric_values" ("id", "dailyEntryId", "metricKey", "ordinalValue", "createdAt", "updatedAt")
SELECT
  "id" || ':calm',
  "id",
  'calm',
  CASE
    WHEN "stressScore" <= 2 THEN 5
    WHEN "stressScore" <= 4 THEN 4
    WHEN "stressScore" <= 6 THEN 3
    WHEN "stressScore" <= 8 THEN 2
    ELSE 1
  END,
  "createdAt",
  CURRENT_TIMESTAMP
FROM "daily_entries"
WHERE "stressScore" IS NOT NULL
ON CONFLICT ("dailyEntryId", "metricKey") DO NOTHING;

INSERT INTO "daily_entry_v2_metric_values" ("id", "dailyEntryId", "metricKey", "ordinalValue", "createdAt", "updatedAt")
SELECT
  demv."dailyEntryId" || ':' || mapped."metricKey",
  demv."dailyEntryId",
  mapped."metricKey",
  CASE
    WHEN demv."value" <= 2 THEN 1
    WHEN demv."value" <= 4 THEN 2
    WHEN demv."value" <= 6 THEN 3
    WHEN demv."value" <= 8 THEN 4
    ELSE 5
  END,
  demv."createdAt",
  CURRENT_TIMESTAMP
FROM "daily_entry_metric_values" demv
JOIN "daily_metric_definitions" dmd ON dmd."id" = demv."metricDefinitionId"
JOIN (
  VALUES
    ('motivation', 'motivation'),
    ('motivation_score', 'motivation'),
    ('wellbeing', 'overall_state'),
    ('concentration', 'clarity')
) AS mapped("legacyKey", "metricKey") ON mapped."legacyKey" = dmd."key"
ON CONFLICT ("dailyEntryId", "metricKey") DO NOTHING;

UPDATE "daily_entries"
SET "sleepQuality" = CASE
  WHEN "sleepQuality" <= 2 THEN 1
  WHEN "sleepQuality" <= 4 THEN 2
  WHEN "sleepQuality" <= 6 THEN 3
  WHEN "sleepQuality" <= 8 THEN 4
  ELSE 5
END
WHERE "sleepQuality" IS NOT NULL;

ALTER TABLE "daily_entries"
DROP CONSTRAINT IF EXISTS "daily_entries_sleep_quality_check";

ALTER TABLE "daily_entries"
ADD CONSTRAINT "daily_entries_sleep_quality_check" CHECK (
  "sleepQuality" IS NULL OR "sleepQuality" BETWEEN 1 AND 5
);
