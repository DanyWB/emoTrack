-- CreateEnum
CREATE TYPE "DailyMetricInputType" AS ENUM ('score', 'sleep_block');

-- CreateTable
CREATE TABLE "daily_metric_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "inputType" "DailyMetricInputType" NOT NULL DEFAULT 'score',
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_metric_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tracked_metrics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metricDefinitionId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tracked_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_entry_metric_values" (
    "id" TEXT NOT NULL,
    "dailyEntryId" TEXT NOT NULL,
    "metricDefinitionId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_entry_metric_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_metric_definitions_key_key" ON "daily_metric_definitions"("key");

-- CreateIndex
CREATE INDEX "daily_metric_definitions_isActive_sortOrder_idx" ON "daily_metric_definitions"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "user_tracked_metrics_userId_isEnabled_sortOrder_idx" ON "user_tracked_metrics"("userId", "isEnabled", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "user_tracked_metrics_userId_metricDefinitionId_key" ON "user_tracked_metrics"("userId", "metricDefinitionId");

-- CreateIndex
CREATE INDEX "daily_entry_metric_values_metricDefinitionId_dailyEntryId_idx" ON "daily_entry_metric_values"("metricDefinitionId", "dailyEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_entry_metric_values_dailyEntryId_metricDefinitionId_key" ON "daily_entry_metric_values"("dailyEntryId", "metricDefinitionId");

-- AddForeignKey
ALTER TABLE "user_tracked_metrics" ADD CONSTRAINT "user_tracked_metrics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tracked_metrics" ADD CONSTRAINT "user_tracked_metrics_metricDefinitionId_fkey" FOREIGN KEY ("metricDefinitionId") REFERENCES "daily_metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entry_metric_values" ADD CONSTRAINT "daily_entry_metric_values_dailyEntryId_fkey" FOREIGN KEY ("dailyEntryId") REFERENCES "daily_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entry_metric_values" ADD CONSTRAINT "daily_entry_metric_values_metricDefinitionId_fkey" FOREIGN KEY ("metricDefinitionId") REFERENCES "daily_metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
