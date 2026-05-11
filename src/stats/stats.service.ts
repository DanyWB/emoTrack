import { Injectable, Logger } from '@nestjs/common';
import { SummaryPeriodType, type DailyEntry, type Event } from '@prisma/client';

import { CheckinsService, type EntryWithExtraMetricScores } from '../checkins/checkins.service';
import { formatDateKey } from '../common/utils/date.utils';
import { DAILY_METRIC_LABELS_BY_KEY, type DailyMetricCatalogKey } from '../daily-metrics/daily-metrics.catalog';
import { EventsService } from '../events/events.service';
import { doesEventOverlapDay } from '../events/events.utils';
import { average, roundToTwo } from './calculators/stats.calculator';
import {
  isLowDataStats,
  STATS_MIN_ENTRIES_FOR_EVENT_PATTERN,
  STATS_MIN_ENTRIES_FOR_SLEEP_PATTERN,
  STATS_MIN_ENTRIES_FOR_WEEKDAY_PATTERN,
  STATS_MIN_EVENT_COMPARISON_GROUP,
  STATS_MIN_EVENT_MOOD_DELTA,
  STATS_MIN_GROUP_SIZE_FOR_SPLIT_PATTERN,
  STATS_MIN_SLEEP_PATTERN_DELTA,
  STATS_MIN_SLEEP_PATTERN_WIN_GAP,
  STATS_MIN_TOP_EVENT_COUNT,
  STATS_MIN_WEEKDAY_CLEAR_LEAD,
  STATS_MIN_WEEKDAY_OCCURRENCES,
  STATS_MIN_WEEKDAY_PATTERN_DELTA,
} from './stats.constants';
import {
  type PeriodRange,
  type PeriodStatsPayload,
  type StatsAverages,
  type StatsDaySummary,
  type StatsDelta,
  type StatsExtraMetricAverage,
  type StatsEventCompanionPattern,
  type StatsPatternInsights,
  type StatsSelectedMetricKey,
  type StatsSleepStatePattern,
  type StatsWeekdayMoodPattern,
  type SelectedMetricChartPoint,
  type SelectedMetricStatsPayload,
} from './stats.types';

const DAY_MS = 24 * 60 * 60 * 1000;

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number';
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly checkinsService: CheckinsService,
    private readonly eventsService: EventsService,
  ) {}

  async buildPeriodStats(
    userId: string,
    periodType: SummaryPeriodType,
    options: { timezone?: string | null } = {},
  ): Promise<PeriodStatsPayload> {
    const range = this.resolvePeriodRange(periodType, options.timezone);
    const [entries, extraMetricAverages, events] = await Promise.all([
      this.checkinsService.getEntriesForPeriod(userId, range.periodStart, range.periodEnd),
      this.checkinsService.getExtraMetricAveragesForPeriod(userId, range.periodStart, range.periodEnd),
      this.eventsService.getEventsForPeriod(userId, range.periodStart, range.periodEnd),
    ]);
    const isLowData = isLowDataStats(entries.length);

    const averages = this.calculateAverages(entries);
    const bestDay = this.findBestDay(entries);
    const worstDay = this.findWorstDay(entries);
    const eventBreakdown = this.buildEventBreakdown(events);
    const eventDayKeys = this.buildEventDayKeys(entries, events);
    const bestDayKey = bestDay?.date;
    const worstDayKey = worstDay?.date;

    let deltaVsPreviousPeriod: StatsDelta | null = null;
    let patternInsights: StatsPatternInsights | null = null;

    if (periodType !== SummaryPeriodType.all && range.previousPeriodStart && range.previousPeriodEnd) {
      const previousEntries = await this.checkinsService.getEntriesForPeriod(
        userId,
        range.previousPeriodStart,
        range.previousPeriodEnd,
      );
      deltaVsPreviousPeriod = this.buildDeltaFromEntries(entries, previousEntries);
    }

    if (!isLowData) {
      patternInsights = this.buildPatternInsights(entries, events);
    }

    this.logger.log(
      `Built stats for user ${userId}: period=${periodType}, entries=${entries.length}, events=${events.length}, lowData=${isLowData}`,
    );

    return {
      periodType,
      periodStart: range.periodStart,
      periodEnd: range.periodEnd,
      entriesCount: entries.length,
      eventsCount: events.length,
      isLowData,
      averages,
      extraMetricAverages: extraMetricAverages.map((metric) => ({
        ...metric,
        average: roundToTwo(metric.average),
      })),
      bestDay,
      worstDay,
      eventBreakdown,
      deltaVsPreviousPeriod,
      patternInsights,
      chartPoints: entries.map((entry) => {
        const dateKey = formatDateKey(entry.entryDate);

        return {
          date: dateKey,
          mood: isNumber(entry.moodScore) ? entry.moodScore : undefined,
          energy: isNumber(entry.energyScore) ? entry.energyScore : undefined,
          stress: isNumber(entry.stressScore) ? entry.stressScore : undefined,
          sleepHours: entry.sleepHours ? Number(entry.sleepHours) : undefined,
          sleepQuality: entry.sleepQuality ?? undefined,
          hasEvent: eventDayKeys.has(dateKey),
          isBestDay: dateKey === bestDayKey,
          isWorstDay: dateKey === worstDayKey,
          isSleepMissing: entry.sleepHours === null && entry.sleepQuality === null,
        };
      }),
    };
  }

  async buildSelectedMetricStatsFromPayload(
    userId: string,
    payload: PeriodStatsPayload,
    metricKey: StatsSelectedMetricKey,
  ): Promise<SelectedMetricStatsPayload> {
    if (metricKey === 'sleep') {
      return this.buildSelectedSleepMetricStats(payload);
    }

    if (this.isLegacyCoreMetric(metricKey)) {
      return this.buildSelectedCoreMetricStats(payload, metricKey);
    }

    return this.buildSelectedExtraMetricStats(userId, payload, metricKey);
  }

  calculateAverages(entries: DailyEntry[]): StatsAverages {
    const moodValues = entries.map((entry) => entry.moodScore).filter(isNumber);
    const energyValues = entries.map((entry) => entry.energyScore).filter(isNumber);
    const stressValues = entries.map((entry) => entry.stressScore).filter(isNumber);
    const sleepHoursValues = entries
      .filter((entry) => entry.sleepHours !== null)
      .map((entry) => Number(entry.sleepHours));
    const sleepQualityValues = entries
      .filter((entry) => entry.sleepQuality !== null)
      .map((entry) => entry.sleepQuality as number);

    return {
      mood: average(moodValues),
      energy: average(energyValues),
      stress: average(stressValues),
      sleepHours: average(sleepHoursValues),
      sleepQuality: average(sleepQualityValues),
    };
  }

  calculateExtraMetricAverages(entries: Array<Pick<EntryWithExtraMetricScores, 'extraMetricScores'>>): StatsExtraMetricAverage[] {
    const metricsByKey = new Map<string, { label: string; values: number[] }>();

    for (const entry of entries) {
      for (const metric of entry.extraMetricScores) {
        const current: { label: string; values: number[] } = metricsByKey.get(metric.key) ?? {
          label: metric.label,
          values: [],
        };
        current.values.push(metric.value);
        metricsByKey.set(metric.key, current);
      }
    }

    return [...metricsByKey.entries()]
      .map(([key, data]) => ({
        key,
        label: data.label,
        average: roundToTwo(average(data.values) ?? 0),
        observationsCount: data.values.length,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  private buildSelectedCoreMetricStats(
    payload: PeriodStatsPayload,
    metricKey: 'mood' | 'energy' | 'stress',
  ): SelectedMetricStatsPayload {
    const metricLabel = DAILY_METRIC_LABELS_BY_KEY[metricKey];
    const chartPoints = payload.chartPoints.map((point) => ({
      date: point.date,
      value: this.getCoreMetricPointValue(point, metricKey),
    }));
    const observationsCount = chartPoints.filter((point) => typeof point.value === 'number').length;

    return {
      periodType: payload.periodType,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      entriesCount: payload.entriesCount,
      eventsCount: payload.eventsCount,
      isLowData: payload.isLowData,
      metricKey,
      metricLabel,
      metricKind: 'score',
      observationsCount,
      average: payload.averages[metricKey],
      deltaVsPreviousPeriod: payload.deltaVsPreviousPeriod?.[metricKey] ?? null,
      sleepHoursDeltaVsPreviousPeriod: null,
      sleepQualityDeltaVsPreviousPeriod: null,
      bestDay: metricKey === 'mood' ? payload.bestDay : null,
      worstDay: metricKey === 'mood' ? payload.worstDay : null,
      sleepHoursAverage: null,
      sleepQualityAverage: null,
      sleepHoursObservationsCount: 0,
      sleepQualityObservationsCount: 0,
      chartPoints,
      sleepChartPoints: [],
    };
  }

  private buildSelectedSleepMetricStats(payload: PeriodStatsPayload): SelectedMetricStatsPayload {
    const sleepChartPoints = payload.chartPoints.map((point) => ({
      date: point.date,
      sleepHours: point.sleepHours,
      sleepQuality: point.sleepQuality,
      isSleepMissing: point.isSleepMissing,
    }));

    return {
      periodType: payload.periodType,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      entriesCount: payload.entriesCount,
      eventsCount: payload.eventsCount,
      isLowData: payload.isLowData,
      metricKey: 'sleep',
      metricLabel: DAILY_METRIC_LABELS_BY_KEY.sleep,
      metricKind: 'sleep_block',
      observationsCount: sleepChartPoints.filter(
        (point) => typeof point.sleepHours === 'number' || typeof point.sleepQuality === 'number',
      ).length,
      average: null,
      deltaVsPreviousPeriod: null,
      sleepHoursDeltaVsPreviousPeriod: payload.deltaVsPreviousPeriod?.sleepHours ?? null,
      sleepQualityDeltaVsPreviousPeriod: payload.deltaVsPreviousPeriod?.sleepQuality ?? null,
      bestDay: null,
      worstDay: null,
      sleepHoursAverage: payload.averages.sleepHours,
      sleepQualityAverage: payload.averages.sleepQuality,
      sleepHoursObservationsCount: sleepChartPoints.filter((point) => typeof point.sleepHours === 'number').length,
      sleepQualityObservationsCount: sleepChartPoints.filter((point) => typeof point.sleepQuality === 'number').length,
      chartPoints: [],
      sleepChartPoints,
    };
  }

  private async buildSelectedExtraMetricStats(
    userId: string,
    payload: PeriodStatsPayload,
    metricKey: DailyMetricCatalogKey,
  ): Promise<SelectedMetricStatsPayload> {
    const selectedAverage = payload.extraMetricAverages.find((metric) => metric.key === metricKey) ?? null;
    const entriesWithExtraMetrics =
      selectedAverage && selectedAverage.observationsCount > 0
        ? await this.checkinsService.getEntriesForPeriodWithExtraMetrics(userId, payload.periodStart, payload.periodEnd)
        : [];
    const extraMetricValuesByDate = new Map<string, number>();

    for (const entry of entriesWithExtraMetrics) {
      const metric = entry.extraMetricScores.find((item) => item.key === metricKey);

      if (!metric) {
        continue;
      }

      extraMetricValuesByDate.set(formatDateKey(entry.entryDate), metric.value);
    }

    const chartPoints: SelectedMetricChartPoint[] = payload.chartPoints.map((point) => ({
      date: point.date,
      value: extraMetricValuesByDate.get(point.date),
    }));

    return {
      periodType: payload.periodType,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      entriesCount: payload.entriesCount,
      eventsCount: payload.eventsCount,
      isLowData: payload.isLowData,
      metricKey,
      metricLabel: selectedAverage?.label ?? DAILY_METRIC_LABELS_BY_KEY[metricKey],
      metricKind: 'score',
      observationsCount: selectedAverage?.observationsCount ?? 0,
      average: selectedAverage?.average ?? null,
      deltaVsPreviousPeriod: null,
      sleepHoursDeltaVsPreviousPeriod: null,
      sleepQualityDeltaVsPreviousPeriod: null,
      bestDay: null,
      worstDay: null,
      sleepHoursAverage: null,
      sleepQualityAverage: null,
      sleepHoursObservationsCount: 0,
      sleepQualityObservationsCount: 0,
      chartPoints,
      sleepChartPoints: [],
    };
  }

  findBestDay(entries: DailyEntry[]): StatsDaySummary | null {
    const eligibleEntries = entries.filter((entry) => isNumber(entry.moodScore));

    if (eligibleEntries.length === 0) {
      return null;
    }

    const sorted = [...eligibleEntries].sort((left, right) => {
      if (left.moodScore !== right.moodScore) {
        return (right.moodScore as number) - (left.moodScore as number);
      }

      if (isNumber(left.energyScore) && isNumber(right.energyScore) && left.energyScore !== right.energyScore) {
        return (right.energyScore as number) - (left.energyScore as number);
      }

      if (isNumber(left.stressScore) && isNumber(right.stressScore) && left.stressScore !== right.stressScore) {
        return (left.stressScore as number) - (right.stressScore as number);
      }

      return left.entryDate.getTime() - right.entryDate.getTime();
    });

    return this.toDaySummary(sorted[0]);
  }

  findWorstDay(entries: DailyEntry[]): StatsDaySummary | null {
    const eligibleEntries = entries.filter((entry) => isNumber(entry.moodScore));

    if (eligibleEntries.length === 0) {
      return null;
    }

    const sorted = [...eligibleEntries].sort((left, right) => {
      if (left.moodScore !== right.moodScore) {
        return (left.moodScore as number) - (right.moodScore as number);
      }

      if (isNumber(left.energyScore) && isNumber(right.energyScore) && left.energyScore !== right.energyScore) {
        return (left.energyScore as number) - (right.energyScore as number);
      }

      if (isNumber(left.stressScore) && isNumber(right.stressScore) && left.stressScore !== right.stressScore) {
        return (right.stressScore as number) - (left.stressScore as number);
      }

      return left.entryDate.getTime() - right.entryDate.getTime();
    });

    return this.toDaySummary(sorted[0]);
  }

  buildEventBreakdown(events: Event[]): Partial<Record<Event['eventType'], number>> {
    return events.reduce<Partial<Record<Event['eventType'], number>>>((acc, event) => {
      acc[event.eventType] = (acc[event.eventType] ?? 0) + 1;
      return acc;
    }, {});
  }

  findSleepStatePattern(entries: DailyEntry[]): StatsSleepStatePattern | null {
    if (entries.length < STATS_MIN_ENTRIES_FOR_SLEEP_PATTERN) {
      return null;
    }

    const candidates = [
      this.buildSleepHoursPattern(entries, 'mood'),
      this.buildSleepHoursPattern(entries, 'energy'),
      this.buildSleepQualityStressPattern(entries),
    ].filter((pattern): pattern is StatsSleepStatePattern => !!pattern);

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => right.delta - left.delta);

    if (candidates.length > 1 && candidates[0].delta - candidates[1].delta < STATS_MIN_SLEEP_PATTERN_WIN_GAP) {
      return null;
    }

    return candidates[0];
  }

  findWeekdayMoodPattern(entries: DailyEntry[]): StatsWeekdayMoodPattern | null {
    const eligibleEntries = entries.filter((entry) => isNumber(entry.moodScore));

    if (eligibleEntries.length < STATS_MIN_ENTRIES_FOR_WEEKDAY_PATTERN) {
      return null;
    }

    const grouped = new Map<number, number[]>();

    for (const entry of eligibleEntries) {
      const weekday = entry.entryDate.getUTCDay();
      const values = grouped.get(weekday) ?? [];
      values.push(entry.moodScore as number);
      grouped.set(weekday, values);
    }

    const summaries = [...grouped.entries()]
      .filter(([, values]) => values.length >= STATS_MIN_WEEKDAY_OCCURRENCES)
      .map(([weekday, values]) => ({
        weekday,
        averageMood: average(values),
      }))
      .filter((item): item is { weekday: number; averageMood: number } => item.averageMood !== null);

    if (summaries.length < 2) {
      return null;
    }

    const bestSorted = [...summaries].sort((left, right) => right.averageMood - left.averageMood);
    const worstSorted = [...summaries].sort((left, right) => left.averageMood - right.averageMood);

    const best = bestSorted[0];
    const worst = worstSorted[0];

    if (!best || !worst || best.weekday === worst.weekday) {
      return null;
    }

    const secondBest = bestSorted[1];
    const secondWorst = worstSorted[1];

    if (secondBest && best.averageMood - secondBest.averageMood < STATS_MIN_WEEKDAY_CLEAR_LEAD) {
      return null;
    }

    if (secondWorst && secondWorst.averageMood - worst.averageMood < STATS_MIN_WEEKDAY_CLEAR_LEAD) {
      return null;
    }

    if (best.averageMood - worst.averageMood < STATS_MIN_WEEKDAY_PATTERN_DELTA) {
      return null;
    }

    return {
      bestWeekday: best.weekday,
      bestMood: best.averageMood,
      worstWeekday: worst.weekday,
      worstMood: worst.averageMood,
    };
  }

  buildEventCompanion(entries: DailyEntry[], events: Event[]): StatsEventCompanionPattern | null {
    const eligibleEntries = entries.filter((entry) => isNumber(entry.moodScore));

    if (eligibleEntries.length < STATS_MIN_ENTRIES_FOR_EVENT_PATTERN || events.length === 0) {
      return null;
    }

    const eventBreakdown = Object.entries(this.buildEventBreakdown(events)).sort((left, right) => right[1] - left[1]);
    const eventCompanion: StatsEventCompanionPattern = {};

    const topEvent = eventBreakdown[0];
    const secondEvent = eventBreakdown[1];

    if (
      topEvent &&
      topEvent[1] >= STATS_MIN_TOP_EVENT_COUNT &&
      (!secondEvent || topEvent[1] > secondEvent[1])
    ) {
      eventCompanion.topEventType = topEvent[0] as Event['eventType'];
      eventCompanion.topEventCount = topEvent[1];
    }

    const eventDayKeys = this.buildEventDayKeys(eligibleEntries, events);
    const eventDayEntries = eligibleEntries.filter((entry) => eventDayKeys.has(formatDateKey(entry.entryDate)));
    const quietDayEntries = eligibleEntries.filter((entry) => !eventDayKeys.has(formatDateKey(entry.entryDate)));

    if (
      eventDayEntries.length >= STATS_MIN_EVENT_COMPARISON_GROUP &&
      quietDayEntries.length >= STATS_MIN_EVENT_COMPARISON_GROUP
    ) {
      const eventDayMood = average(eventDayEntries.map((entry) => entry.moodScore as number));
      const quietDayMood = average(quietDayEntries.map((entry) => entry.moodScore as number));

      if (
        eventDayMood !== null &&
        quietDayMood !== null &&
        Math.abs(eventDayMood - quietDayMood) >= STATS_MIN_EVENT_MOOD_DELTA
      ) {
        eventCompanion.moodDeltaOnEventDays = roundToTwo(eventDayMood - quietDayMood);
      }
    }

    if (
      eventCompanion.topEventType === undefined &&
      eventCompanion.topEventCount === undefined &&
      eventCompanion.moodDeltaOnEventDays === undefined
    ) {
      return null;
    }

    return eventCompanion;
  }

  async calculateDeltaVsPrevious(
    userId: string,
    periodType: SummaryPeriodType,
    previousPeriodStart?: Date,
    previousPeriodEnd?: Date,
    options: { timezone?: string | null } = {},
  ): Promise<StatsDelta | null> {
    if (periodType === SummaryPeriodType.all) {
      return null;
    }

    const previousStart = previousPeriodStart;
    const previousEnd = previousPeriodEnd;

    if (!previousStart || !previousEnd) {
      const range = this.resolvePeriodRange(periodType, options.timezone);

      if (!range.previousPeriodStart || !range.previousPeriodEnd) {
        return null;
      }

      return this.calculateDeltaVsPrevious(
        userId,
        periodType,
        range.previousPeriodStart,
        range.previousPeriodEnd,
      );
    }

    const previousEntries = await this.checkinsService.getEntriesForPeriod(userId, previousStart, previousEnd);

    if (previousEntries.length === 0) {
      return null;
    }

    const currentRange = this.resolvePeriodRange(periodType, options.timezone);
    const currentEntries = await this.checkinsService.getEntriesForPeriod(
      userId,
      currentRange.periodStart,
      currentRange.periodEnd,
    );

    if (currentEntries.length === 0) {
      return null;
    }

    return this.buildDeltaFromEntries(currentEntries, previousEntries);
  }

  private resolvePeriodRange(periodType: SummaryPeriodType, timezone?: string | null): PeriodRange {
    const today = this.checkinsService.buildEntryDate({ date: new Date(), timezone });

    if (periodType === SummaryPeriodType.d7) {
      const periodStart = this.shiftDays(today, -6);
      return {
        periodStart,
        periodEnd: today,
        previousPeriodStart: this.shiftDays(periodStart, -7),
        previousPeriodEnd: this.shiftDays(periodStart, -1),
      };
    }

    if (periodType === SummaryPeriodType.d30) {
      const periodStart = this.shiftDays(today, -29);
      return {
        periodStart,
        periodEnd: today,
        previousPeriodStart: this.shiftDays(periodStart, -30),
        previousPeriodEnd: this.shiftDays(periodStart, -1),
      };
    }

    return {
      periodStart: new Date('1970-01-01T00:00:00.000Z'),
      periodEnd: today,
    };
  }

  private shiftDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
  }

  private toDaySummary(entry: DailyEntry): StatsDaySummary {
    return {
      date: formatDateKey(entry.entryDate),
      moodScore: entry.moodScore as number,
      energyScore: entry.energyScore ?? null,
      stressScore: entry.stressScore ?? null,
    };
  }

  private delta(current: number | null, previous: number | null): number | null {
    if (current === null || previous === null) {
      return null;
    }

    return Math.round((current - previous) * 100) / 100;
  }

  private buildDeltaFromEntries(currentEntries: DailyEntry[], previousEntries: DailyEntry[]): StatsDelta | null {
    if (currentEntries.length === 0 || previousEntries.length === 0) {
      return null;
    }

    const current = this.calculateAverages(currentEntries);
    const previous = this.calculateAverages(previousEntries);

    return {
      mood: this.delta(current.mood, previous.mood),
      energy: this.delta(current.energy, previous.energy),
      stress: this.delta(current.stress, previous.stress),
      sleepHours: this.delta(current.sleepHours, previous.sleepHours),
      sleepQuality: this.delta(current.sleepQuality, previous.sleepQuality),
    };
  }

  private buildPatternInsights(entries: DailyEntry[], events: Event[]): StatsPatternInsights | null {
    const sleepState = this.findSleepStatePattern(entries);
    const weekdayMood = this.findWeekdayMoodPattern(entries);
    const eventCompanion = this.buildEventCompanion(entries, events);

    if (!sleepState && !weekdayMood && !eventCompanion) {
      return null;
    }

    return {
      sleepState,
      weekdayMood,
      eventCompanion,
    };
  }

  private buildSleepHoursPattern(
    entries: DailyEntry[],
    metric: 'mood' | 'energy',
  ): StatsSleepStatePattern | null {
    const eligibleEntries = entries.filter((entry) => entry.sleepHours !== null);

    if (eligibleEntries.length < STATS_MIN_ENTRIES_FOR_SLEEP_PATTERN) {
      return null;
    }

    const splitPoint = average(eligibleEntries.map((entry) => Number(entry.sleepHours)));

    if (splitPoint === null) {
      return null;
    }

    const lowSleepEntries = eligibleEntries.filter((entry) => Number(entry.sleepHours) < splitPoint);
    const highSleepEntries = eligibleEntries.filter((entry) => Number(entry.sleepHours) > splitPoint);

    if (
      lowSleepEntries.length < STATS_MIN_GROUP_SIZE_FOR_SPLIT_PATTERN ||
      highSleepEntries.length < STATS_MIN_GROUP_SIZE_FOR_SPLIT_PATTERN
    ) {
      return null;
    }

    const delta = roundToTwo(
      this.averageEntryMetric(highSleepEntries, metric) - this.averageEntryMetric(lowSleepEntries, metric),
    );

    if (delta < STATS_MIN_SLEEP_PATTERN_DELTA) {
      return null;
    }

    return {
      kind: metric === 'mood' ? 'sleep_hours_mood' : 'sleep_hours_energy',
      delta,
    };
  }

  private buildSleepQualityStressPattern(entries: DailyEntry[]): StatsSleepStatePattern | null {
    const eligibleEntries = entries.filter((entry) => entry.sleepQuality !== null);

    if (eligibleEntries.length < STATS_MIN_ENTRIES_FOR_SLEEP_PATTERN) {
      return null;
    }

    const splitPoint = average(
      eligibleEntries.map((entry) => entry.sleepQuality).filter((value): value is number => value !== null),
    );

    if (splitPoint === null) {
      return null;
    }

    const lowQualityEntries = eligibleEntries.filter((entry) => (entry.sleepQuality as number) < splitPoint);
    const highQualityEntries = eligibleEntries.filter((entry) => (entry.sleepQuality as number) > splitPoint);

    if (
      lowQualityEntries.length < STATS_MIN_GROUP_SIZE_FOR_SPLIT_PATTERN ||
      highQualityEntries.length < STATS_MIN_GROUP_SIZE_FOR_SPLIT_PATTERN
    ) {
      return null;
    }

    const delta = roundToTwo(
      this.averageEntryMetric(lowQualityEntries, 'stress') - this.averageEntryMetric(highQualityEntries, 'stress'),
    );

    if (delta < STATS_MIN_SLEEP_PATTERN_DELTA) {
      return null;
    }

    return {
      kind: 'sleep_quality_stress',
      delta,
    };
  }

  private averageEntryMetric(entries: DailyEntry[], metric: 'mood' | 'energy' | 'stress'): number {
    if (metric === 'mood') {
      return average(entries.map((entry) => entry.moodScore).filter(isNumber)) ?? 0;
    }

    if (metric === 'energy') {
      return average(entries.map((entry) => entry.energyScore).filter(isNumber)) ?? 0;
    }

    return average(entries.map((entry) => entry.stressScore).filter(isNumber)) ?? 0;
  }

  private buildEventDayKeys(entries: DailyEntry[], events: Event[]): Set<string> {
    const dayKeys = new Set<string>();

    for (const entry of entries) {
      if (events.some((event) => doesEventOverlapDay(event, entry.entryDate))) {
        dayKeys.add(formatDateKey(entry.entryDate));
      }
    }

    return dayKeys;
  }

  private getCoreMetricPointValue(
    point: PeriodStatsPayload['chartPoints'][number],
    metricKey: 'mood' | 'energy' | 'stress',
  ): number | undefined {
    if (metricKey === 'mood') {
      return point.mood;
    }

    if (metricKey === 'energy') {
      return point.energy;
    }

    return point.stress;
  }

  private isLegacyCoreMetric(metricKey: StatsSelectedMetricKey): metricKey is 'mood' | 'energy' | 'stress' {
    return metricKey === 'mood' || metricKey === 'energy' || metricKey === 'stress';
  }

}
