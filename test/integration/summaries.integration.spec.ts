import { SummaryPeriodType } from '@prisma/client';

import { TelegramRouter } from '../../src/telegram/telegram.router';
import { STATS_METRIC_LABELS, STATS_PERIOD_LABELS, formatStatsSelectedMetricChartCaption, telegramCopy } from '../../src/telegram/telegram.copy';
import { buildUser } from '../helpers/in-memory';
import { createIntegrationTestContext, type IntegrationTestContext } from '../helpers/test-context';

describe('Summaries integration', () => {
  let ctx: IntegrationTestContext;

  beforeEach(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterEach(async () => {
    await ctx.moduleRef.close();
  });

  async function createReadyUser() {
    return ctx.usersRepository.create(
      buildUser({
        id: 'user-summary-1',
        telegramId: BigInt(7001),
        onboardingCompleted: true,
        consentGiven: true,
        reminderTime: '21:30',
      }),
    );
  }

  async function attachEntryMetricValues(entryId: string, values: Record<string, number>): Promise<void> {
    const definitionsByKey = new Map(
      ctx.dailyMetricsRepository.listDefinitions().map((definition) => [definition.key, definition.id] as const),
    );

    await ctx.checkinsRepository.upsertMetricValues(
      entryId,
      Object.entries(values).map(([key, value]) => {
        const metricDefinitionId = definitionsByKey.get(key);

        if (!metricDefinitionId) {
          throw new Error(`Metric definition ${key} not found`);
        }

        return {
          metricDefinitionId,
          value,
        };
      }),
    );
  }

  it('builds and persists a normal summary payload through the real stats path', async () => {
    const user = await createReadyUser();
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

    await ctx.checkinsRepository.upsertByUserAndDate(user.id, twoDaysAgo, {
      moodScore: 5,
      energyScore: 5,
      stressScore: 6,
      sleepHours: 6.5,
      sleepQuality: 5,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
      sleepHours: 7,
      sleepQuality: 6,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
      sleepHours: 7.5,
      sleepQuality: 8,
    });
    await ctx.eventsService.createEvent(user.id, {
      eventType: 'work',
      title: 'Sprint review',
      eventScore: 7,
      eventDate: today.toISOString(),
    });

    const payload = await ctx.summariesService.generateSummary(user.id, SummaryPeriodType.d7, {
      timezone: user.timezone,
      persist: true,
    });
    const text = ctx.summariesService.formatSummaryText(payload);

    expect(payload.entriesCount).toBe(3);
    expect(payload.eventsCount).toBe(1);
    expect(payload.isLowData).toBe(false);
    expect(payload.averages).toMatchObject({
      mood: 6.33,
      energy: 5.67,
      stress: 4.33,
      sleepHours: 7,
      sleepQuality: 6.33,
    });
    expect(payload.patternInsights).toBeNull();
    expect(ctx.summariesRepository.summaries).toHaveLength(1);
    expect(text).toContain(telegramCopy.stats.titlePrefix);
    expect(text).toContain(telegramCopy.stats.daysLabel);
  });

  it('shows extra tracked metrics in the stats text without changing legacy summary semantics', async () => {
    const user = await createReadyUser();
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

    const firstEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, twoDaysAgo, {
      moodScore: 5,
      energyScore: 5,
      stressScore: 6,
      sleepHours: 6.5,
      sleepQuality: 5,
    });
    const secondEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
      sleepHours: 7,
      sleepQuality: 6,
    });
    const thirdEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
      sleepHours: 7.5,
      sleepQuality: 8,
    });

    await attachEntryMetricValues(firstEntry.id, {
      joy: 7,
    });
    await attachEntryMetricValues(secondEntry.id, {
      joy: 8,
      wellbeing: 6,
    });
    await attachEntryMetricValues(thirdEntry.id, {
      joy: 9,
      wellbeing: 8,
    });
    await ctx.usersService.setTrackedMetric(user.id, 'joy', true);
    await ctx.usersService.setTrackedMetric(user.id, 'wellbeing', true);
    await ctx.usersService.setTrackedMetric(user.id, 'joy', false);
    await ctx.usersService.setTrackedMetric(user.id, 'wellbeing', false);

    const payload = await ctx.summariesService.generateSummary(user.id, SummaryPeriodType.d7, {
      timezone: user.timezone,
      persist: false,
    });
    const text = ctx.summariesService.formatSummaryText(payload);

    expect(payload.extraMetricAverages).toEqual([
      {
        key: 'joy',
        label: 'Радость',
        average: 8,
        observationsCount: 3,
      },
      {
        key: 'wellbeing',
        label: 'Самочувствие',
        average: 7,
        observationsCount: 2,
      },
    ]);
    expect(text).toContain(telegramCopy.stats.extraMetricsLabel);
    expect(text).toContain('- Радость: 8.00');
    expect(text).toContain('- Самочувствие: 7.00');
  });

  it('keeps historical extra metrics visible in the stats summary when their definition becomes inactive', async () => {
    const user = await createReadyUser();
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

    const firstEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, twoDaysAgo, {
      moodScore: 5,
      energyScore: 5,
      stressScore: 6,
    });
    const secondEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
    });
    const thirdEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
    });

    await attachEntryMetricValues(firstEntry.id, { joy: 7 });
    await attachEntryMetricValues(secondEntry.id, { joy: 8 });
    await attachEntryMetricValues(thirdEntry.id, { joy: 9 });
    ctx.dailyMetricsRepository.setDefinitionActive('joy', false);

    const payload = await ctx.summariesService.generateSummary(user.id, SummaryPeriodType.d7, {
      timezone: user.timezone,
      persist: false,
    });
    const text = ctx.summariesService.formatSummaryText(payload);
    const joyAverage = payload.extraMetricAverages.find((metric) => metric.key === 'joy');

    expect(payload.extraMetricAverages).toEqual([
      expect.objectContaining({
        key: 'joy',
        average: 8,
      }),
    ]);
    expect(joyAverage).toBeDefined();
    expect(text).toContain(`- ${joyAverage?.label}: 8.00`);
  });

  it('renders an extra-only stats summary without legacy noise or best-day block', async () => {
    const user = await createReadyUser();
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });

    const firstEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000), {
      moodScore: null,
      energyScore: null,
      stressScore: null,
    });
    const secondEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date(today.getTime() - 24 * 60 * 60 * 1000), {
      moodScore: null,
      energyScore: null,
      stressScore: null,
    });
    const thirdEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: null,
      energyScore: null,
      stressScore: null,
    });

    await attachEntryMetricValues(firstEntry.id, {
      joy: 7,
      wellbeing: 6,
    });
    await attachEntryMetricValues(secondEntry.id, {
      joy: 8,
      wellbeing: 7,
    });
    await attachEntryMetricValues(thirdEntry.id, {
      joy: 9,
      wellbeing: 8,
    });

    const payload = await ctx.summariesService.generateSummary(user.id, SummaryPeriodType.d7, {
      timezone: user.timezone,
      persist: false,
    });
    const text = ctx.summariesService.formatSummaryText(payload);
    const joyAverage = payload.extraMetricAverages.find((metric) => metric.key === 'joy');
    const wellbeingAverage = payload.extraMetricAverages.find((metric) => metric.key === 'wellbeing');

    expect(payload.bestDay).toBeNull();
    expect(payload.worstDay).toBeNull();
    expect(joyAverage).toBeDefined();
    expect(wellbeingAverage).toBeDefined();
    expect(text).toContain(`${telegramCopy.stats.averagesLabel}:`);
    expect(text).toContain(`- ${joyAverage?.label}: 8.00`);
    expect(text).toContain(`- ${wellbeingAverage?.label}: 7.00`);
    expect(text).not.toContain(`- ${STATS_METRIC_LABELS.mood}:`);
    expect(text).not.toContain(`- ${STATS_METRIC_LABELS.energy}:`);
    expect(text).not.toContain(`- ${STATS_METRIC_LABELS.stress}:`);
    expect(text).not.toContain(`${telegramCopy.stats.extraMetricsLabel}:`);
    expect(text).not.toContain(telegramCopy.stats.bestDayLabel);
    expect(text).not.toContain(telegramCopy.stats.worstDayLabel);
  });

  it('renders the best/worst day block for a mood-only dataset without requiring full core scores', async () => {
    const user = await createReadyUser();
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });

    await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000), {
      moodScore: 5,
      energyScore: null,
      stressScore: null,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date(today.getTime() - 24 * 60 * 60 * 1000), {
      moodScore: 8,
      energyScore: null,
      stressScore: null,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: 6,
      energyScore: null,
      stressScore: null,
    });

    const payload = await ctx.summariesService.generateSummary(user.id, SummaryPeriodType.d7, {
      timezone: user.timezone,
      persist: false,
    });
    const text = ctx.summariesService.formatSummaryText(payload);

    expect(payload.bestDay).toMatchObject({
      date: expect.any(String),
      moodScore: 8,
      energyScore: null,
      stressScore: null,
    });
    expect(payload.worstDay).toMatchObject({
      date: expect.any(String),
      moodScore: 5,
      energyScore: null,
      stressScore: null,
    });
    expect(text).toContain(telegramCopy.stats.bestDayLabel);
    expect(text).toContain(telegramCopy.stats.worstDayLabel);
  });

  it('keeps the same mixed summary semantics on the all-time stats path after aggregated extra-metric reads', async () => {
    const user = await createReadyUser();

    const firstEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date('2026-03-05T00:00:00.000Z'), {
      moodScore: 5,
      energyScore: 5,
      stressScore: 6,
      sleepHours: 6.5,
      sleepQuality: 5,
    });
    const secondEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date('2026-03-09T00:00:00.000Z'), {
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
      sleepHours: 7,
      sleepQuality: 6,
    });
    const thirdEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date('2026-03-12T00:00:00.000Z'), {
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
      sleepHours: 7.5,
      sleepQuality: 8,
    });

    await attachEntryMetricValues(firstEntry.id, { joy: 7 });
    await attachEntryMetricValues(secondEntry.id, { joy: 8, wellbeing: 6 });
    await attachEntryMetricValues(thirdEntry.id, { joy: 9, wellbeing: 8 });

    const payload = await ctx.summariesService.generateSummary(user.id, SummaryPeriodType.all, {
      timezone: user.timezone,
      persist: false,
    });
    const text = ctx.summariesService.formatSummaryText(payload);

    expect(payload.entriesCount).toBe(3);
    expect(payload.averages).toMatchObject({
      mood: 6.33,
      energy: 5.67,
      stress: 4.33,
    });
    expect(payload.extraMetricAverages).toEqual([
      {
        key: 'joy',
        label: 'Радость',
        average: 8,
        observationsCount: 3,
      },
      {
        key: 'wellbeing',
        label: 'Самочувствие',
        average: 7,
        observationsCount: 2,
      },
    ]);
    expect(text).toContain('- Радость: 8.00');
    expect(text).toContain('- Самочувствие: 7.00');
  });

  it('builds comparison and conservative pattern blocks when the dataset is strong enough', async () => {
    const user = await createReadyUser();
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });

    for (let index = 0; index < 7; index += 1) {
      const entryDate = new Date(today.getTime() - index * 24 * 60 * 60 * 1000);
      const isHighSleepDay = index < 3;

      await ctx.checkinsRepository.upsertByUserAndDate(user.id, entryDate, {
        moodScore: isHighSleepDay ? 8 : 6,
        energyScore: isHighSleepDay ? 8 : 5,
        stressScore: isHighSleepDay ? 3 : 5,
        sleepHours: isHighSleepDay ? 8 : 5,
        sleepQuality: isHighSleepDay ? 8 : 6,
      });
    }

    for (let index = 7; index < 14; index += 1) {
      const entryDate = new Date(today.getTime() - index * 24 * 60 * 60 * 1000);

      await ctx.checkinsRepository.upsertByUserAndDate(user.id, entryDate, {
        moodScore: 5,
        energyScore: 4,
        stressScore: 6,
        sleepHours: 6,
        sleepQuality: 6,
      });
    }

    const payload = await ctx.summariesService.generateSummary(user.id, SummaryPeriodType.d7, {
      timezone: user.timezone,
      persist: false,
    });
    const text = ctx.summariesService.formatSummaryText(payload);

    expect(payload.isLowData).toBe(false);
    expect(payload.deltaVsPreviousPeriod).toMatchObject({
      mood: 1.86,
      energy: 2.29,
      stress: -1.86,
      sleepHours: 0.29,
      sleepQuality: 0.86,
    });
    expect(payload.patternInsights?.sleepState).toEqual({
      kind: 'sleep_hours_energy',
      delta: 3,
    });
    expect(payload.patternInsights?.weekdayMood).toBeNull();
    expect(payload.patternInsights?.eventCompanion).toBeNull();
    expect(text).toContain(telegramCopy.stats.comparisonLabel);
    expect(text).toContain(telegramCopy.stats.patternsLabel);
    expect(text).toContain('3.00');
  });


  it('uses the low-data selected-metric summary path and skips charts for sparse periods', async () => {
    const user = await createReadyUser();
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
    });

    const router = new TelegramRouter(
      ctx.usersService,
      ctx.onboardingFlow,
      ctx.checkinsFlow,
      ctx.checkinsService,
      ctx.eventsFlow,
      ctx.summariesService,
      {
        generateSelectedMetricChart: jest.fn().mockResolvedValue(Buffer.from('selected-chart')),
      } as never,
      ctx.remindersService,
      ctx.tagsService,
      ctx.fsmService,
      ctx.analyticsService,
    );

    const telegramCtx = {
      reply: jest.fn().mockResolvedValue(undefined),
      replyWithPhoto: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleStatsMetricSelection(telegramCtx, user, SummaryPeriodType.d7, 'mood');

    expect(
      telegramCtx.reply.mock.calls.some(
        ([message]: [string]) => typeof message === 'string' && message.includes(telegramCopy.stats.lowDataLead),
      ),
    ).toBe(true);
    expect(
      telegramCtx.reply.mock.calls.every(
        ([message]: [string]) =>
          typeof message !== 'string' ||
          (!message.includes(`${telegramCopy.stats.comparisonLabel}:`) &&
            !message.includes(`${telegramCopy.stats.patternsLabel}:`)),
      ),
    ).toBe(true);
    expect(telegramCtx.replyWithPhoto).not.toHaveBeenCalled();
    expect(await ctx.fsmService.getState(user.id)).toBe('idle');
  });

  it('falls back to text summary when selected-metric chart generation fails for a normal dataset', async () => {
    const user = await createReadyUser();
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

    await ctx.checkinsRepository.upsertByUserAndDate(user.id, twoDaysAgo, {
      moodScore: 6,
      energyScore: 6,
      stressScore: 5,
      sleepHours: 7,
      sleepQuality: 6,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: 7,
      energyScore: 6,
      stressScore: 4,
      sleepHours: 7,
      sleepQuality: 7,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: 8,
      energyScore: 7,
      stressScore: 4,
      sleepHours: 7,
      sleepQuality: 7,
    });

    const router = new TelegramRouter(
      ctx.usersService,
      ctx.onboardingFlow,
      ctx.checkinsFlow,
      ctx.checkinsService,
      ctx.eventsFlow,
      ctx.summariesService,
      {
        generateSelectedMetricChart: jest.fn().mockRejectedValue(new Error('chart failed')),
      } as never,
      ctx.remindersService,
      ctx.tagsService,
      ctx.fsmService,
      ctx.analyticsService,
    );

    const telegramCtx = {
      reply: jest.fn().mockResolvedValue(undefined),
      replyWithPhoto: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleStatsMetricSelection(telegramCtx, user, SummaryPeriodType.d7, 'mood');

    expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.stats.loading);
    expect(
      telegramCtx.reply.mock.calls.some(
        ([message]: [string]) =>
          typeof message === 'string' &&
          message.includes(STATS_PERIOD_LABELS.d7) &&
          message.includes(STATS_METRIC_LABELS.mood),
      ),
    ).toBe(true);
    expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.stats.chartUnavailable);
    expect(await ctx.fsmService.getState(user.id)).toBe('idle');

    const trackedEvents = ctx.analyticsRepository.events.map((event) => event.eventName);
    expect(trackedEvents).toEqual(expect.arrayContaining(['summary_sent', 'chart_generation_failed']));
  });

  it('sends a selected metric chart image for a normal dataset when a chart buffer is available', async () => {
    const user = await createReadyUser();
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

    await ctx.checkinsRepository.upsertByUserAndDate(user.id, twoDaysAgo, {
      moodScore: 5,
      energyScore: 5,
      stressScore: 6,
      sleepHours: 6.5,
      sleepQuality: 5,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
      sleepHours: 7,
      sleepQuality: 6,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
      sleepHours: 7.5,
      sleepQuality: 8,
    });

    const router = new TelegramRouter(
      ctx.usersService,
      ctx.onboardingFlow,
      ctx.checkinsFlow,
      ctx.checkinsService,
      ctx.eventsFlow,
      ctx.summariesService,
      {
        generateSelectedMetricChart: jest.fn().mockResolvedValue(Buffer.from('selected')),
      } as never,
      ctx.remindersService,
      ctx.tagsService,
      ctx.fsmService,
      ctx.analyticsService,
    );

    const telegramCtx = {
      reply: jest.fn().mockResolvedValue(undefined),
      replyWithPhoto: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleStatsMetricSelection(telegramCtx, user, SummaryPeriodType.d7, 'mood');

    expect(telegramCtx.replyWithPhoto).toHaveBeenCalledTimes(1);
    expect(telegramCtx.replyWithPhoto).toHaveBeenCalledWith(
      { source: Buffer.from('selected') },
      { caption: formatStatsSelectedMetricChartCaption(STATS_METRIC_LABELS.mood, SummaryPeriodType.d7) },
    );
  });
});
