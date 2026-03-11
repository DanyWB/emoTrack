import { Injectable } from '@nestjs/common';
import { SummaryPeriodType, type DailyEntry, type Event } from '@prisma/client';

import { CheckinsService } from '../checkins/checkins.service';
import { formatDateKey } from '../common/utils/date.utils';
import { EventsService } from '../events/events.service';
import { average } from './calculators/stats.calculator';
import {
  type PeriodRange,
  type PeriodStatsPayload,
  type StatsAverages,
  type StatsDaySummary,
  type StatsDelta,
} from './stats.types';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class StatsService {
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
    const entries = await this.checkinsService.getEntriesForPeriod(userId, range.periodStart, range.periodEnd);
    const events = await this.eventsService.getEventsForPeriod(userId, range.periodStart, range.periodEnd);

    const averages = this.calculateAverages(entries);
    const bestDay = this.findBestDay(entries);
    const worstDay = this.findWorstDay(entries);
    const eventBreakdown = this.buildEventBreakdown(events);

    let deltaVsPreviousPeriod: StatsDelta | null = null;

    if (periodType !== SummaryPeriodType.all && range.previousPeriodStart && range.previousPeriodEnd) {
      deltaVsPreviousPeriod = await this.calculateDeltaVsPrevious(
        userId,
        periodType,
        range.previousPeriodStart,
        range.previousPeriodEnd,
      );
    }

    return {
      periodType,
      periodStart: range.periodStart,
      periodEnd: range.periodEnd,
      entriesCount: entries.length,
      eventsCount: events.length,
      averages,
      bestDay,
      worstDay,
      eventBreakdown,
      deltaVsPreviousPeriod,
      chartPoints: entries.map((entry) => ({
        date: formatDateKey(entry.entryDate),
        mood: entry.moodScore,
        energy: entry.energyScore,
        stress: entry.stressScore,
        sleepHours: entry.sleepHours ? Number(entry.sleepHours) : undefined,
        sleepQuality: entry.sleepQuality ?? undefined,
      })),
    };
  }

  calculateAverages(entries: DailyEntry[]): StatsAverages {
    const moodValues = entries.map((entry) => entry.moodScore);
    const energyValues = entries.map((entry) => entry.energyScore);
    const stressValues = entries.map((entry) => entry.stressScore);
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

  findBestDay(entries: DailyEntry[]): StatsDaySummary | null {
    if (entries.length === 0) {
      return null;
    }

    const sorted = [...entries].sort((left, right) => {
      if (left.moodScore !== right.moodScore) {
        return right.moodScore - left.moodScore;
      }

      if (left.energyScore !== right.energyScore) {
        return right.energyScore - left.energyScore;
      }

      if (left.stressScore !== right.stressScore) {
        return left.stressScore - right.stressScore;
      }

      return left.entryDate.getTime() - right.entryDate.getTime();
    });

    return this.toDaySummary(sorted[0]);
  }

  findWorstDay(entries: DailyEntry[]): StatsDaySummary | null {
    if (entries.length === 0) {
      return null;
    }

    const sorted = [...entries].sort((left, right) => {
      if (left.moodScore !== right.moodScore) {
        return left.moodScore - right.moodScore;
      }

      if (left.energyScore !== right.energyScore) {
        return left.energyScore - right.energyScore;
      }

      if (left.stressScore !== right.stressScore) {
        return right.stressScore - left.stressScore;
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
      moodScore: entry.moodScore,
      energyScore: entry.energyScore,
      stressScore: entry.stressScore,
    };
  }

  private delta(current: number | null, previous: number | null): number | null {
    if (current === null || previous === null) {
      return null;
    }

    return Math.round((current - previous) * 100) / 100;
  }
}
