-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('update', 'important', 'maintenance', 'poll', 'other');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('consented');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('draft', 'ready', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AnnouncementDeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'blocked');

-- CreateTable
CREATE TABLE "announcement_campaigns" (
    "id" TEXT NOT NULL,
    "type" "AnnouncementType" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'consented',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'draft',
    "createdByAdminTelegramId" BIGINT NOT NULL,
    "imageTelegramFileId" TEXT,
    "imageTelegramFileUniqueId" TEXT,
    "imageAddedAt" TIMESTAMP(3),
    "pollToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "announcement_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_deliveries" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "status" "AnnouncementDeliveryStatus" NOT NULL DEFAULT 'pending',
    "telegramMessageIds" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcement_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_poll_options" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_poll_votes" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "announcement_campaigns_pollToken_key" ON "announcement_campaigns"("pollToken");

-- CreateIndex
CREATE INDEX "announcement_campaigns_status_createdAt_idx" ON "announcement_campaigns"("status", "createdAt");

-- CreateIndex
CREATE INDEX "announcement_campaigns_createdAt_idx" ON "announcement_campaigns"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_deliveries_campaignId_userId_key" ON "announcement_deliveries"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "announcement_deliveries_campaignId_status_idx" ON "announcement_deliveries"("campaignId", "status");

-- CreateIndex
CREATE INDEX "announcement_deliveries_userId_createdAt_idx" ON "announcement_deliveries"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_poll_options_campaignId_sortOrder_key" ON "announcement_poll_options"("campaignId", "sortOrder");

-- CreateIndex
CREATE INDEX "announcement_poll_options_campaignId_sortOrder_idx" ON "announcement_poll_options"("campaignId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_poll_votes_campaignId_userId_key" ON "announcement_poll_votes"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "announcement_poll_votes_campaignId_optionId_idx" ON "announcement_poll_votes"("campaignId", "optionId");

-- AddForeignKey
ALTER TABLE "announcement_deliveries" ADD CONSTRAINT "announcement_deliveries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "announcement_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_deliveries" ADD CONSTRAINT "announcement_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_poll_options" ADD CONSTRAINT "announcement_poll_options_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "announcement_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_poll_votes" ADD CONSTRAINT "announcement_poll_votes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "announcement_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_poll_votes" ADD CONSTRAINT "announcement_poll_votes_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "announcement_poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_poll_votes" ADD CONSTRAINT "announcement_poll_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
