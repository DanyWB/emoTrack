import { Injectable } from '@nestjs/common';
import { SummaryPeriodType } from '@prisma/client';

import type { PeriodStatsPayload } from '../stats/stats.types';
import { EVENT_TYPE_LABELS, STATS_PERIOD_LABELS } from '../telegram/telegram.copy';

@Injectable()
export class SummariesFormatter {
  formatSummaryText(payload: PeriodStatsPayload): string {
    const lines: string[] = [
      `Сводка за период: ${this.periodLabel(payload.periodType)}`,
      `Записей: ${payload.entriesCount}`,
      `Событий: ${payload.eventsCount}`,
      `Среднее настроение: ${this.numberOrDash(payload.averages.mood)}`,
      `Средняя энергия: ${this.numberOrDash(payload.averages.energy)}`,
      `Средний стресс: ${this.numberOrDash(payload.averages.stress)}`,
    ];

    if (payload.averages.sleepHours !== null || payload.averages.sleepQuality !== null) {
      lines.push(`Средний сон (часы): ${this.numberOrDash(payload.averages.sleepHours)}`);
      lines.push(`Среднее качество сна: ${this.numberOrDash(payload.averages.sleepQuality)}`);
    }

    if (payload.bestDay) {
      lines.push(`Лучший день: ${payload.bestDay.date} (${payload.bestDay.moodScore})`);
    }

    if (payload.worstDay) {
      lines.push(`Сложный день: ${payload.worstDay.date} (${payload.worstDay.moodScore})`);
    }

    const topEvents = Object.entries(payload.eventBreakdown)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3);

    if (topEvents.length > 0) {
      lines.push('События по типам:');
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
