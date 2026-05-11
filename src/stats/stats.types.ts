import type { EventType, SummaryPeriodType } from '@prisma/client';

import type { ChartPoint } from '../charts/charts.types';
import type { DailyMetricCatalogKey } from '../daily-metrics/daily-metrics.catalog';

export interface StatsAverages {
  mood: number | null;
  energy: number | null;
  stress: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
}

export interface StatsExtraMetricAverage {
  key: string;
  label: string;
  average: number;
  observationsCount: number;
}

export interface StatsDaySummary {
  date: string;
  moodScore: number;
  energyScore: number | null;
  stressScore: number | null;
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
  extraMetricAverages: StatsExtraMetricAverage[];
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

export type StatsSelectedMetricKey = DailyMetricCatalogKey | 'sleep';

export interface SelectedMetricChartPoint {
  date: string;
  value?: number;
}

export interface SelectedMetricStatsPayload {
  periodType: SummaryPeriodType;
  periodStart: Date;
  periodEnd: Date;
  entriesCount: number;
  eventsCount: number;
  isLowData: boolean;
  metricKey: StatsSelectedMetricKey;
  metricLabel: string;
  metricKind: 'score' | 'sleep_block';
  observationsCount: number;
  average: number | null;
  deltaVsPreviousPeriod?: number | null;
  sleepHoursDeltaVsPreviousPeriod?: number | null;
  sleepQualityDeltaVsPreviousPeriod?: number | null;
  bestDay: StatsDaySummary | null;
  worstDay: StatsDaySummary | null;
  sleepHoursAverage: number | null;
  sleepQualityAverage: number | null;
  sleepHoursObservationsCount: number;
  sleepQualityObservationsCount: number;
  chartPoints: SelectedMetricChartPoint[];
  sleepChartPoints: ChartPoint[];
}
