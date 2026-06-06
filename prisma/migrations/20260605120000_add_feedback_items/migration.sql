-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('bug', 'idea', 'question', 'review', 'other');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('unread', 'reviewed', 'closed');

-- CreateTable
CREATE TABLE "feedback_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "feedbackType" "FeedbackType" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'unread',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_items_status_createdAt_idx" ON "feedback_items"("status", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_items_userId_createdAt_idx" ON "feedback_items"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
