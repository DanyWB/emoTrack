import { Injectable } from '@nestjs/common';
import { SummaryPeriodType } from '@prisma/client';

import type { PeriodStatsPayload } from '../stats/stats.types';
import { EVENT_TYPE_LABELS, STATS_PERIOD_LABELS, telegramCopy } from '../telegram/telegram.copy';

@Injectable()
export class SummariesFormatter {
  formatSummaryText(payload: PeriodStatsPayload): string {
    const lines: string[] = [
      `${telegramCopy.stats.titlePrefix}: ${this.periodLabel(payload.periodType)}`,
    ];

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
    lines.push(`- Настроение: ${this.numberOrDash(payload.averages.mood)}`);
    lines.push(`- Энергия: ${this.numberOrDash(payload.averages.energy)}`);
    lines.push(`- Стресс: ${this.numberOrDash(payload.averages.stress)}`);

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

    if (payload.bestDay || payload.worstDay) {
      lines.push('');
      lines.push(`${telegramCopy.stats.daysLabel}:`);

      if (payload.bestDay) {
        lines.push(
          `- ${telegramCopy.stats.bestDayLabel}: ${payload.bestDay.date} (${payload.bestDay.moodScore})`,
        );
      }

      if (payload.worstDay) {
        lines.push(
          `- ${telegramCopy.stats.worstDayLabel}: ${payload.worstDay.date} (${payload.worstDay.moodScore})`,
        );
      }
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
}
