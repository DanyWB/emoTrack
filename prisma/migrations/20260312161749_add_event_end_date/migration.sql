-- AlterTable
ALTER TABLE "events" ADD COLUMN     "eventEndDate" DATE;

-- CreateIndex
CREATE INDEX "events_userId_eventDate_eventEndDate_idx" ON "events"("userId", "eventDate", "eventEndDate");
