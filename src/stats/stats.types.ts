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

export type StatsSleepPatternKind =
  | 'sleep_hours_mood'
  | 'sleep_hours_energy'
  | 'sleep_quality_stress';

export interface StatsSleepStatePattern {
  kind: StatsSleepPatternKind;
  delta: number;
}

export interface StatsWeekdayMoodPattern {
  bestWeekday: number;
  bestMood: number;
  worstWeekday: number;
  worstMood: number;
}

export interface StatsEventCompanionPattern {
  topEventType?: EventType;
  topEventCount?: number;
  moodDeltaOnEventDays?: number;
}

export interface StatsPatternInsights {
  sleepState?: StatsSleepStatePattern | null;
  weekdayMood?: StatsWeekdayMoodPattern | null;
  eventCompanion?: StatsEventCompanionPattern | null;
}

export interface PeriodStatsPayload {
  periodType: SummaryPeriodType;
  periodStart: Date;
  periodEnd: Date;
  entriesCount: number;
  eventsCount: number;
  isLowData: boolean;
  averages: StatsAverages;
  bestDay: StatsDaySummary | null;
  worstDay: StatsDaySummary | null;
  eventBreakdown: Partial<Record<EventType, number>>;
  deltaVsPreviousPeriod?: StatsDelta | null;
  patternInsights?: StatsPatternInsights | null;
  chartPoints: ChartPoint[];
}

export interface PeriodRange {
  periodStart: Date;
  periodEnd: Date;
  previousPeriodStart?: Date;
  previousPeriodEnd?: Date;
}
