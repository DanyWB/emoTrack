import type { EventType, SummaryPeriodType } from '@prisma/client';

import type { ChartPoint } from '../charts/charts.types';

export interface StatsAverages {
  mood: number | null;
  energy: number | null;
  stress: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
}

export interface StatsDaySummary {
  date: string;
  moodScore: number;
  energyScore: number;
  stressScore: number;
}

export interface StatsDelta {
  mood: number | null;
  energy: number | null;
  stress: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
}

export interface PeriodStatsPayload {
  periodType: SummaryPeriodType;
  periodStart: Date;
  periodEnd: Date;
  entriesCount: number;
  eventsCount: number;
  averages: StatsAverages;
  bestDay: StatsDaySummary | null;
  worstDay: StatsDaySummary | null;
  eventBreakdown: Partial<Record<EventType, number>>;
  deltaVsPreviousPeriod?: StatsDelta | null;
  chartPoints: ChartPoint[];
}

export interface PeriodRange {
  periodStart: Date;
  periodEnd: Date;
  previousPeriodStart?: Date;
  previousPeriodEnd?: Date;
}
