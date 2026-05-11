import { Injectable } from '@nestjs/common';
import { SummaryPeriodType } from '@prisma/client';

import type {
  PeriodStatsPayload,
  SelectedMetricStatsPayload,
  StatsAverages,
  StatsDelta,
  StatsEventCompanionPattern,
  StatsExtraMetricAverage,
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
    return this.buildSummaryText(
      payload,
      `${telegramCopy.stats.titlePrefix}: ${this.periodLabel(payload.periodType)}`,
    );
  }

  formatWeeklyDigestText(payload: PeriodStatsPayload): string {
    return this.buildSummaryText(
      payload,
      telegramCopy.reminders.weeklyDigestTitle,
      telegramCopy.reminders.weeklyDigestLead,
    );
  }

  formatSelectedMetricSummaryText(payload: SelectedMetricStatsPayload): string {
    const lines: string[] = [
      `📊 ${payload.metricLabel}: ${this.periodLabel(payload.periodType)}`,
      telegramCopy.stats.selectedMetricLead,
      '',
    ];

    if (payload.entriesCount === 0) {
      lines.push('Данных за этот период пока нет.');
      return lines.join('\n');
    }

    if (payload.isLowData) {
      lines.push(telegramCopy.stats.lowDataLead);
    }

    lines.push(`${telegramCopy.stats.countsLabel}:`);
    lines.push(`- Записей в периоде: ${payload.entriesCount}`);

    if (payload.metricKind === 'sleep_block') {
      lines.push(`- Отметок по часам сна: ${payload.sleepHoursObservationsCount}`);
      lines.push(`- Отметок по качеству сна: ${payload.sleepQualityObservationsCount}`);
      lines.push('');
      lines.push(`${telegramCopy.stats.sleepLabel}:`);
      lines.push(`- Часы: ${this.numberOrDash(payload.sleepHoursAverage)}`);
      lines.push(`- Качество: ${this.numberOrDash(payload.sleepQualityAverage)}`);

      const sleepComparisonLines = this.buildSleepComparisonLines(payload);
      if (sleepComparisonLines.length > 0 && !payload.isLowData) {
        lines.push('');
        lines.push(`${telegramCopy.stats.comparisonLabel}:`);
        lines.push(...sleepComparisonLines);
      }
    } else {
      lines.push(`- Отметок по метрике: ${payload.observationsCount}`);

      if (payload.observationsCount === 0 || payload.average === null) {
        lines.push('');
        lines.push('За выбранный период по этой метрике пока нет оценок.');
      } else {
        lines.push('');
        lines.push(`${telegramCopy.stats.averagesLabel}:`);
        lines.push(`- ${payload.metricLabel}: ${this.number(payload.average)}`);

        if (typeof payload.deltaVsPreviousPeriod === 'number' && !payload.isLowData) {
          lines.push('');
          lines.push(`${telegramCopy.stats.comparisonLabel}:`);
          lines.push(`- ${payload.metricLabel}: ${this.formatSignedNumber(payload.deltaVsPreviousPeriod)}`);
        }
      }
    }

    if (!payload.isLowData && payload.metricKey === 'mood' && (payload.bestDay || payload.worstDay)) {
      lines.push('');
      lines.push(`${telegramCopy.stats.daysLabel}:`);

      if (payload.bestDay) {
        lines.push(`- ${telegramCopy.stats.bestDayLabel}: ${payload.bestDay.date} (${payload.bestDay.moodScore})`);
      }

      if (payload.worstDay) {
        lines.push(`- ${telegramCopy.stats.worstDayLabel}: ${payload.worstDay.date} (${payload.worstDay.moodScore})`);
      }
    }

    if (payload.isLowData) {
      lines.push('');
      lines.push(telegramCopy.stats.lowDataNote);
    }

    return lines.join('\n');
  }

  private buildSummaryText(
    payload: PeriodStatsPayload,
    heading: string,
    lead?: string,
  ): string {
    const lines: string[] = [heading];

    if (lead) {
      lines.push(lead);
    }

    if (payload.entriesCount === 0) {
      lines.push('');
      lines.push('Записей: 0');
      lines.push('Событий: 0');
      lines.push('Данных пока нет.');
      return lines.join('\n');
    }

    lines.push('');

    if (payload.isLowData) {
      lines.push(telegramCopy.stats.lowDataLead);
    }

    lines.push(`${telegramCopy.stats.countsLabel}:`);
    lines.push(`- Записей: ${payload.entriesCount}`);
    lines.push(`- Событий: ${payload.eventsCount}`);

    const coreAverageLines = this.buildCoreAverageLines(payload.averages);
    const extraMetricAverageLines = this.buildExtraMetricAverageLines(payload.extraMetricAverages);

    if (coreAverageLines.length > 0 || extraMetricAverageLines.length > 0) {
      lines.push('');
      lines.push(`${telegramCopy.stats.averagesLabel}:`);
      lines.push(...coreAverageLines);

      if (coreAverageLines.length > 0 && extraMetricAverageLines.length > 0) {
        lines.push('');
        lines.push(`${telegramCopy.stats.extraMetricsLabel}:`);
      }

      if (coreAverageLines.length === 0) {
        lines.push(...extraMetricAverageLines);
      } else if (extraMetricAverageLines.length > 0) {
        lines.push(...extraMetricAverageLines);
      }
    }

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

  private buildSleepComparisonLines(payload: SelectedMetricStatsPayload): string[] {
    const lines: string[] = [];

    if (
      typeof payload.sleepHoursDeltaVsPreviousPeriod === 'number' &&
      Math.abs(payload.sleepHoursDeltaVsPreviousPeriod) >= 0.01
    ) {
      lines.push(
        `- ${STATS_METRIC_LABELS.sleepHours}: ${this.formatSignedNumber(payload.sleepHoursDeltaVsPreviousPeriod)}`,
      );
    }

    if (
      typeof payload.sleepQualityDeltaVsPreviousPeriod === 'number' &&
      Math.abs(payload.sleepQualityDeltaVsPreviousPeriod) >= 0.01
    ) {
      lines.push(
        `- ${STATS_METRIC_LABELS.sleepQuality}: ${this.formatSignedNumber(payload.sleepQualityDeltaVsPreviousPeriod)}`,
      );
    }

    return lines;
  }

  private buildCoreAverageLines(averages: StatsAverages): string[] {
    const entries: Array<[keyof Pick<StatsAverages, 'mood' | 'energy' | 'stress'>, number | null]> = [
      ['mood', averages.mood],
      ['energy', averages.energy],
      ['stress', averages.stress],
    ];

    return entries
      .filter(([, value]) => value !== null)
      .map(([key, value]) => `- ${STATS_METRIC_LABELS[key]}: ${this.numberOrDash(value)}`);
  }

  private buildExtraMetricAverageLines(metrics: StatsExtraMetricAverage[] | undefined): string[] {
    if (!metrics || metrics.length === 0) {
      return [];
    }

    return metrics.map((metric) => `- ${metric.label}: ${metric.average.toFixed(2)}`);
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
