-- CreateEnum
CREATE TYPE "SleepMode" AS ENUM ('hours', 'quality', 'both');

-- CreateEnum
CREATE TYPE "SummaryPeriodType" AS ENUM ('d7', 'd30', 'all');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('work', 'study', 'relationships', 'family', 'friends', 'health', 'sleep', 'sport', 'rest', 'money', 'travel', 'other');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "languageCode" TEXT NOT NULL DEFAULT 'ru',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderTime" VARCHAR(5),
    "sleepMode" "SleepMode" NOT NULL DEFAULT 'both',
    "notesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "tagsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "eventsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "moodScore" INTEGER NOT NULL,
    "energyScore" INTEGER NOT NULL,
    "stressScore" INTEGER NOT NULL,
    "sleepHours" DECIMAL(4,2),
    "sleepQuality" INTEGER,
    "noteText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "daily_entries_scores_check" CHECK (
      "moodScore" BETWEEN 0 AND 10 AND
      "energyScore" BETWEEN 0 AND 10 AND
      "stressScore" BETWEEN 0 AND 10
    ),
    CONSTRAINT "daily_entries_sleep_hours_check" CHECK (
      "sleepHours" IS NULL OR ("sleepHours" >= 0 AND "sleepHours" <= 24)
    ),
    CONSTRAINT "daily_entries_sleep_quality_check" CHECK (
      "sleepQuality" IS NULL OR "sleepQuality" BETWEEN 0 AND 10
    )
);

-- CreateTable
CREATE TABLE "predefined_tags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "predefined_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_entry_tags" (
    "id" TEXT NOT NULL,
    "dailyEntryId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "daily_entry_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyEntryId" TEXT,
    "eventDate" DATE NOT NULL,
    "eventType" "EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "events_score_check" CHECK ("eventScore" BETWEEN 0 AND 10)
);

-- CreateTable
CREATE TABLE "summaries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" "SummaryPeriodType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fsm_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fsm_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventName" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegramId_key" ON "users"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_entries_userId_entryDate_key" ON "daily_entries"("userId", "entryDate");

-- CreateIndex
CREATE INDEX "daily_entries_userId_entryDate_idx" ON "daily_entries"("userId", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "predefined_tags_key_key" ON "predefined_tags"("key");

-- CreateIndex
CREATE UNIQUE INDEX "daily_entry_tags_dailyEntryId_tagId_key" ON "daily_entry_tags"("dailyEntryId", "tagId");

-- CreateIndex
CREATE INDEX "events_userId_eventDate_idx" ON "events"("userId", "eventDate");

-- CreateIndex
CREATE INDEX "summaries_userId_periodType_periodEnd_idx" ON "summaries"("userId", "periodType", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "fsm_sessions_userId_key" ON "fsm_sessions"("userId");

-- CreateIndex
CREATE INDEX "product_events_eventName_createdAt_idx" ON "product_events"("eventName", "createdAt");

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entry_tags" ADD CONSTRAINT "daily_entry_tags_dailyEntryId_fkey" FOREIGN KEY ("dailyEntryId") REFERENCES "daily_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entry_tags" ADD CONSTRAINT "daily_entry_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "predefined_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_dailyEntryId_fkey" FOREIGN KEY ("dailyEntryId") REFERENCES "daily_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fsm_sessions" ADD CONSTRAINT "fsm_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
