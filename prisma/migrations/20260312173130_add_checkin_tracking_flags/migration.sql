-- AlterTable
ALTER TABLE "daily_entries" ALTER COLUMN "moodScore" DROP NOT NULL,
ALTER COLUMN "energyScore" DROP NOT NULL,
ALTER COLUMN "stressScore" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "trackEnergy" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "trackMood" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "trackSleep" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "trackStress" BOOLEAN NOT NULL DEFAULT true;
