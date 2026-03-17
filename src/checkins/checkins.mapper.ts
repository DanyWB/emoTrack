import type { DailyEntry } from '@prisma/client';

export interface DailyEntryView {
  id: string;
  date: string;
  moodScore: number | null;
  energyScore: number | null;
  stressScore: number | null;
}

export function mapDailyEntryToView(entry: DailyEntry): DailyEntryView {
  return {
    id: entry.id,
    date: entry.entryDate.toISOString().slice(0, 10),
    moodScore: entry.moodScore,
    energyScore: entry.energyScore,
    stressScore: entry.stressScore,
  };
}
