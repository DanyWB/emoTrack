import { SummaryPeriodType } from '@prisma/client';

import { SummariesFormatter } from '../../src/summaries/summaries.formatter';
import type { PeriodStatsPayload } from '../../src/stats/stats.types';
import { STATS_METRIC_LABELS, telegramCopy } from '../../src/telegram/telegram.copy';

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
    extraMetricAverages: [],
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
    patternInsights: null,
    chartPoints: [],
    ...overrides,
  };
}

describe('SummariesFormatter', () => {
  const formatter = new SummariesFormatter();

  it('formats a readable normal summary payload', () => {
    const text = formatter.formatSummaryText(buildPayload());

    expect(text).toContain(telegramCopy.stats.titlePrefix);
    expect(text).toContain(`${telegramCopy.stats.countsLabel}:`);
    expect(text).toContain(`${telegramCopy.stats.averagesLabel}:`);
    expect(text).toContain(`- ${STATS_METRIC_LABELS.mood}: 7.20`);
    expect(text).toContain(`${telegramCopy.stats.sleepLabel}:`);
    expect(text).toContain(`${telegramCopy.stats.daysLabel}:`);
    expect(text).toContain(`- ${telegramCopy.stats.bestDayLabel}: 2026-03-10 (9)`);
    expect(text).toContain(`${telegramCopy.stats.eventsBreakdownLabel}:`);
    expect(text).toContain('- Работа: 2');
  });

  it('uses the explicit low-data branch and omits comparison and pattern blocks', () => {
    const text = formatter.formatSummaryText(
      buildPayload({
        entriesCount: 2,
        eventsCount: 1,
        isLowData: true,
      }),
    );

    expect(text).toContain(telegramCopy.stats.lowDataLead);
    expect(text).toContain(telegramCopy.stats.lowDataNote);
    expect(text).not.toContain(`${telegramCopy.stats.comparisonLabel}:`);
    expect(text).not.toContain(`${telegramCopy.stats.patternsLabel}:`);
    expect(text).not.toContain(`${telegramCopy.stats.daysLabel}:`);
    expect(text).not.toContain(`${telegramCopy.stats.eventsBreakdownLabel}:`);
  });

  it('adds compact comparison and pattern blocks only when they are present', () => {
    const text = formatter.formatSummaryText(
      buildPayload({
        deltaVsPreviousPeriod: {
          mood: 0.8,
          energy: 0.5,
          stress: -0.7,
          sleepHours: null,
          sleepQuality: null,
        },
        patternInsights: {
          sleepState: {
            kind: 'sleep_hours_energy',
            delta: 1.2,
          },
          weekdayMood: {
            bestWeekday: 2,
            bestMood: 7.8,
            worstWeekday: 1,
            worstMood: 5.9,
          },
          eventCompanion: {
            topEventType: 'work',
            topEventCount: 3,
            moodDeltaOnEventDays: -1.1,
          },
        },
      }),
    );

    expect(text).toContain(`${telegramCopy.stats.comparisonLabel}:`);
    expect(text).toContain(`- ${STATS_METRIC_LABELS.mood}: +0.80`);
    expect(text).toContain(`- ${STATS_METRIC_LABELS.stress}: -0.70`);
    expect(text).toContain(`${telegramCopy.stats.patternsLabel}:`);
    expect(text).toContain('1.20');
    expect(text).toContain('Работа (3)');
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

    expect(text).toContain(telegramCopy.stats.titlePrefix);
    expect(text).toContain('Записей: 0');
    expect(text).toContain('Данных пока нет.');
  });

  it('wraps the weekly digest around the same summary body without creating a second summary engine', () => {
    const text = formatter.formatWeeklyDigestText(buildPayload());

    expect(text).toContain(telegramCopy.reminders.weeklyDigestTitle);
    expect(text).toContain(telegramCopy.reminders.weeklyDigestLead);
    expect(text).toContain(`${telegramCopy.stats.countsLabel}:`);
    expect(text).toContain(`${telegramCopy.stats.averagesLabel}:`);
    expect(text).not.toContain(`${telegramCopy.stats.titlePrefix}:`);
  });

  it('renders a compact extra metrics block when generic score averages are present', () => {
    const text = formatter.formatSummaryText(
      buildPayload({
        extraMetricAverages: [
          {
            key: 'joy',
            label: 'Радость',
            average: 8.5,
            observationsCount: 3,
          },
          {
            key: 'wellbeing',
            label: 'Самочувствие',
            average: 6.25,
            observationsCount: 2,
          },
        ],
      }),
    );

    expect(text).toContain(`${telegramCopy.stats.extraMetricsLabel}:`);
    expect(text).toContain('- Радость: 8.50');
    expect(text).toContain('- Самочувствие: 6.25');
  });

  it('renders a selected extra-metric summary without legacy blocks', () => {
    const text = formatter.formatSelectedMetricSummaryText({
      periodType: SummaryPeriodType.d7,
      periodStart: new Date('2026-03-05T00:00:00.000Z'),
      periodEnd: new Date('2026-03-11T00:00:00.000Z'),
      entriesCount: 5,
      eventsCount: 2,
      isLowData: false,
      metricKey: 'joy',
      metricLabel: 'Радость',
      metricKind: 'score',
      observationsCount: 3,
      average: 8,
      deltaVsPreviousPeriod: null,
      sleepHoursDeltaVsPreviousPeriod: null,
      sleepQualityDeltaVsPreviousPeriod: null,
      bestDay: null,
      worstDay: null,
      sleepHoursAverage: null,
      sleepQualityAverage: null,
      sleepHoursObservationsCount: 0,
      sleepQualityObservationsCount: 0,
      chartPoints: [],
      sleepChartPoints: [],
    });

    expect(text).toContain('📊 Радость: 7 дней');
    expect(text).toContain('Отметок по метрике: 3');
    expect(text).toContain('- Радость: 8.00');
    expect(text).not.toContain(telegramCopy.stats.bestDayLabel);
    expect(text).not.toContain(`${telegramCopy.stats.sleepLabel}:`);
  });

  it('renders a selected sleep summary with sleep-specific counts and averages', () => {
    const text = formatter.formatSelectedMetricSummaryText({
      periodType: SummaryPeriodType.d30,
      periodStart: new Date('2026-02-10T00:00:00.000Z'),
      periodEnd: new Date('2026-03-11T00:00:00.000Z'),
      entriesCount: 6,
      eventsCount: 1,
      isLowData: false,
      metricKey: 'sleep',
      metricLabel: 'Сон',
      metricKind: 'sleep_block',
      observationsCount: 6,
      average: null,
      deltaVsPreviousPeriod: null,
      sleepHoursDeltaVsPreviousPeriod: 0.5,
      sleepQualityDeltaVsPreviousPeriod: -0.25,
      bestDay: null,
      worstDay: null,
      sleepHoursAverage: 7.25,
      sleepQualityAverage: 6.5,
      sleepHoursObservationsCount: 5,
      sleepQualityObservationsCount: 4,
      chartPoints: [],
      sleepChartPoints: [],
    });

    expect(text).toContain('📊 Сон: 30 дней');
    expect(text).toContain('Отметок по часам сна: 5');
    expect(text).toContain('Отметок по качеству сна: 4');
    expect(text).toContain('- Часы: 7.25');
    expect(text).toContain('- Качество: 6.50');
    expect(text).toContain(`${telegramCopy.stats.comparisonLabel}:`);
    expect(text).toContain(`- ${STATS_METRIC_LABELS.sleepHours}: +0.50`);
    expect(text).toContain(`- ${STATS_METRIC_LABELS.sleepQuality}: -0.25`);
  });
});
