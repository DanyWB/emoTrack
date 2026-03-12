import { SummaryPeriodType } from '@prisma/client';

import { SummariesFormatter } from '../../src/summaries/summaries.formatter';
import type { PeriodStatsPayload } from '../../src/stats/stats.types';

function buildPayload(overrides: Partial<PeriodStatsPayload> = {}): PeriodStatsPayload {
  return {
    periodType: SummaryPeriodType.d7,
    periodStart: new Date('2026-03-05T00:00:00.000Z'),
    periodEnd: new Date('2026-03-11T00:00:00.000Z'),
    entriesCount: 5,
    eventsCount: 3,
    isLowData: false,
    averages: {
      mood: 7.2,
      energy: 6.4,
      stress: 4.8,
      sleepHours: 7.1,
      sleepQuality: 6.8,
    },
    bestDay: {
      date: '2026-03-10',
      moodScore: 9,
      energyScore: 8,
      stressScore: 2,
    },
    worstDay: {
      date: '2026-03-06',
      moodScore: 4,
      energyScore: 4,
      stressScore: 7,
    },
    eventBreakdown: {
      work: 2,
      rest: 1,
    },
    deltaVsPreviousPeriod: null,
    chartPoints: [],
    ...overrides,
  };
}

describe('SummariesFormatter', () => {
  const formatter = new SummariesFormatter();

  it('formats a readable normal summary payload', () => {
    const text = formatter.formatSummaryText(buildPayload());

    expect(text).toContain('Сводка за период: 7 дней');
    expect(text).toContain('Кратко:');
    expect(text).toContain('- Записей: 5');
    expect(text).toContain('Средние значения:');
    expect(text).toContain('- Настроение: 7.20');
    expect(text).toContain('Сон:');
    expect(text).toContain('Опорные дни:');
    expect(text).toContain('- Лучший день: 2026-03-10 (9)');
    expect(text).toContain('События по типам:');
    expect(text).toContain('- Работа: 2');
  });

  it('uses the explicit low-data branch and omits detailed blocks', () => {
    const text = formatter.formatSummaryText(
      buildPayload({
        entriesCount: 2,
        eventsCount: 1,
        isLowData: true,
        bestDay: {
          date: '2026-03-10',
          moodScore: 9,
          energyScore: 8,
          stressScore: 2,
        },
        worstDay: {
          date: '2026-03-06',
          moodScore: 4,
          energyScore: 4,
          stressScore: 7,
        },
      }),
    );

    expect(text).toContain('Данных пока мало, поэтому сводка предварительная.');
    expect(text).toContain('Подробная сводка и графики появятся, когда будет хотя бы 3 записи за период.');
    expect(text).not.toContain('Опорные дни:');
    expect(text).not.toContain('События по типам:');
  });

  it('renders a graceful empty summary payload if it is formatted directly', () => {
    const text = formatter.formatSummaryText(
      buildPayload({
        entriesCount: 0,
        eventsCount: 0,
        isLowData: false,
        averages: {
          mood: null,
          energy: null,
          stress: null,
          sleepHours: null,
          sleepQuality: null,
        },
        bestDay: null,
        worstDay: null,
        eventBreakdown: {},
      }),
    );

    expect(text).toContain('Сводка за период: 7 дней');
    expect(text).toContain('Записей: 0');
    expect(text).toContain('Данных пока нет.');
  });
});
