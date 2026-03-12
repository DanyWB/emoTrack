-- AlterTable
ALTER TABLE "events"
ADD COLUMN "seriesId" TEXT,
ADD COLUMN "seriesPosition" INTEGER;

-- CreateIndex
CREATE INDEX "events_userId_seriesId_idx" ON "events"("userId", "seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "events_seriesId_seriesPosition_key" ON "events"("seriesId", "seriesPosition");
