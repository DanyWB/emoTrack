import { Injectable } from '@nestjs/common';
import { SummaryPeriodType } from '@prisma/client';

import type {
  PeriodStatsPayload,
  StatsDelta,
  StatsEventCompanionPattern,
  StatsSleepStatePattern,
  StatsWeekdayMoodPattern,
} from '../stats/stats.types';
import {
  EVENT_TYPE_LABELS,
  STATS_METRIC_LABELS,
  STATS_PERIOD_LABELS,
  telegramCopy,
  WEEKDAY_LABELS,
} from '../telegram/telegram.copy';

@Injectable()
export class SummariesFormatter {
  formatSummaryText(payload: PeriodStatsPayload): string {
    const lines: string[] = [`${telegramCopy.stats.titlePrefix}: ${this.periodLabel(payload.periodType)}`];

    if (payload.entriesCount === 0) {
      lines.push('Записей: 0');
      lines.push('Событий: 0');
      lines.push('Данных пока нет.');
      return lines.join('\n');
    }

    if (payload.isLowData) {
      lines.push(telegramCopy.stats.lowDataLead);
    }

    lines.push('');
    lines.push(`${telegramCopy.stats.countsLabel}:`);
    lines.push(`- Записей: ${payload.entriesCount}`);
    lines.push(`- Событий: ${payload.eventsCount}`);
    lines.push('');
    lines.push(`${telegramCopy.stats.averagesLabel}:`);
    lines.push(`- ${STATS_METRIC_LABELS.mood}: ${this.numberOrDash(payload.averages.mood)}`);
    lines.push(`- ${STATS_METRIC_LABELS.energy}: ${this.numberOrDash(payload.averages.energy)}`);
    lines.push(`- ${STATS_METRIC_LABELS.stress}: ${this.numberOrDash(payload.averages.stress)}`);

    if (payload.averages.sleepHours !== null || payload.averages.sleepQuality !== null) {
      lines.push('');
      lines.push(`${telegramCopy.stats.sleepLabel}:`);
      lines.push(`- Часы: ${this.numberOrDash(payload.averages.sleepHours)}`);
      lines.push(`- Качество: ${this.numberOrDash(payload.averages.sleepQuality)}`);
    }

    if (payload.isLowData) {
      lines.push('');
      lines.push(telegramCopy.stats.lowDataNote);
      return lines.join('\n');
    }

    const comparisonLines = this.buildComparisonLines(payload.deltaVsPreviousPeriod);
    if (comparisonLines.length > 0) {
      lines.push('');
      lines.push(`${telegramCopy.stats.comparisonLabel}:`);
      lines.push(...comparisonLines);
    }

    if (payload.bestDay || payload.worstDay) {
      lines.push('');
      lines.push(`${telegramCopy.stats.daysLabel}:`);

      if (payload.bestDay) {
        lines.push(`- ${telegramCopy.stats.bestDayLabel}: ${payload.bestDay.date} (${payload.bestDay.moodScore})`);
      }

      if (payload.worstDay) {
        lines.push(`- ${telegramCopy.stats.worstDayLabel}: ${payload.worstDay.date} (${payload.worstDay.moodScore})`);
      }
    }

    const patternLines = this.buildPatternLines(payload);
    if (patternLines.length > 0) {
      lines.push('');
      lines.push(`${telegramCopy.stats.patternsLabel}:`);
      lines.push(...patternLines);
    }

    const topEvents = Object.entries(payload.eventBreakdown)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3);

    if (topEvents.length > 0) {
      lines.push('');
      lines.push(`${telegramCopy.stats.eventsBreakdownLabel}:`);

      for (const [eventType, count] of topEvents) {
        const label = EVENT_TYPE_LABELS[eventType as keyof typeof EVENT_TYPE_LABELS] ?? eventType;
        lines.push(`- ${label}: ${count}`);
      }
    }

    return lines.join('\n');
  }

  private periodLabel(periodType: SummaryPeriodType): string {
    return STATS_PERIOD_LABELS[periodType];
  }

  private numberOrDash(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
  }

  private buildComparisonLines(delta: StatsDelta | null | undefined): string[] {
    if (!delta) {
      return [];
    }

    const entries: Array<[keyof StatsDelta, number | null]> = [
      ['mood', delta.mood],
      ['energy', delta.energy],
      ['stress', delta.stress],
      ['sleepHours', delta.sleepHours],
      ['sleepQuality', delta.sleepQuality],
    ];

    return entries
      .filter(([, value]) => value !== null && Math.abs(value) >= 0.01)
      .map(([key, value]) => `- ${STATS_METRIC_LABELS[key]}: ${this.formatSignedNumber(value as number)}`);
  }

  private buildPatternLines(payload: PeriodStatsPayload): string[] {
    const lines: string[] = [];
    const patterns = payload.patternInsights;

    if (!patterns) {
      return lines;
    }

    const sleepLine = this.formatSleepPattern(patterns.sleepState ?? null);
    if (sleepLine) {
      lines.push(`- ${sleepLine}`);
    }

    const weekdayLine = this.formatWeekdayPattern(patterns.weekdayMood ?? null);
    if (weekdayLine) {
      lines.push(`- ${weekdayLine}`);
    }

    lines.push(...this.formatEventCompanion(patterns.eventCompanion ?? null).map((line) => `- ${line}`));

    return lines;
  }

  private formatSleepPattern(pattern: StatsSleepStatePattern | null): string | null {
    if (!pattern) {
      return null;
    }

    if (pattern.kind === 'sleep_hours_mood') {
      return this.interpolate(telegramCopy.stats.sleepHoursMoodPattern, {
        delta: this.number(pattern.delta),
      });
    }

    if (pattern.kind === 'sleep_hours_energy') {
      return this.interpolate(telegramCopy.stats.sleepHoursEnergyPattern, {
        delta: this.number(pattern.delta),
      });
    }

    return this.interpolate(telegramCopy.stats.sleepQualityStressPattern, {
      delta: this.number(pattern.delta),
    });
  }

  private formatWeekdayPattern(pattern: StatsWeekdayMoodPattern | null): string | null {
    if (!pattern) {
      return null;
    }

    return this.interpolate(telegramCopy.stats.weekdayMoodPattern, {
      best: WEEKDAY_LABELS[pattern.bestWeekday as keyof typeof WEEKDAY_LABELS],
      worst: WEEKDAY_LABELS[pattern.worstWeekday as keyof typeof WEEKDAY_LABELS],
    });
  }

  private formatEventCompanion(pattern: StatsEventCompanionPattern | null): string[] {
    if (!pattern) {
      return [];
    }

    const lines: string[] = [];

    if (pattern.topEventType && pattern.topEventCount) {
      lines.push(
        this.interpolate(telegramCopy.stats.topEventTypePattern, {
          label: EVENT_TYPE_LABELS[pattern.topEventType],
          count: String(pattern.topEventCount),
        }),
      );
    }

    if (typeof pattern.moodDeltaOnEventDays === 'number') {
      const template =
        pattern.moodDeltaOnEventDays > 0
          ? telegramCopy.stats.eventMoodHigherPattern
          : telegramCopy.stats.eventMoodLowerPattern;

      lines.push(
        this.interpolate(template, {
          delta: this.number(Math.abs(pattern.moodDeltaOnEventDays)),
        }),
      );
    }

    return lines;
  }

  private formatSignedNumber(value: number): string {
    const absolute = this.number(Math.abs(value));
    return value > 0 ? `+${absolute}` : `-${absolute}`;
  }

  private number(value: number): string {
    return value.toFixed(2);
  }

  private interpolate(template: string, values: Record<string, string>): string {
    return Object.entries(values).reduce(
      (acc, [key, value]) => acc.replace(`{${key}}`, value),
      template,
    );
  }
}
