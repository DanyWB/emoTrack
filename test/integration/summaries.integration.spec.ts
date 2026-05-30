import { SummaryPeriodType } from '@prisma/client';

import { TelegramRouter } from '../../src/telegram/telegram.router';
import {
  STATS_METRIC_LABELS,
  STATS_PERIOD_LABELS,
  formatStatsSelectedMetricChartCaption,
  telegramCopy,
} from '../../src/telegram/telegram.copy';
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
        checkinV2OnboardingCompleted: true,
        reminderTime: '21:30',
      }),
    );
  }

  async function attachV2MetricValues(entryId: string, values: Record<string, number>): Promise<void> {
    await ctx.checkinsRepository.upsertV2MetricValues(
      entryId,
      Object.entries(values).map(([key, value]) => ({
        metricKey: key,
        ordinalValue: value,
      })),
    );
  }

  function createRouter(charts: { generateSelectedMetricChart: jest.Mock }) {
    return new TelegramRouter(
      ctx.usersService,
      ctx.onboardingFlow,
      ctx.checkinsFlow,
      ctx.checkinsService,
      ctx.eventsFlow,
      ctx.summariesService,
      charts as never,
      ctx.remindersService,
      ctx.fsmService,
      ctx.analyticsService,
      ctx.adminService,
    );
  }

  async function seedThreeLegacyEntries(userId: string) {
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: 'Europe/Berlin',
    });
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

    const firstEntry = await ctx.checkinsRepository.upsertByUserAndDate(userId, twoDaysAgo, {
      moodScore: 5,
      energyScore: 5,
      stressScore: 6,
      sleepHours: 6.5,
      sleepQuality: 3,
    });
    const secondEntry = await ctx.checkinsRepository.upsertByUserAndDate(userId, yesterday, {
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
      sleepHours: 7,
      sleepQuality: 4,
    });
    const thirdEntry = await ctx.checkinsRepository.upsertByUserAndDate(userId, today, {
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
      sleepHours: 7.5,
      sleepQuality: 5,
    });

    return { today, firstEntry, secondEntry, thirdEntry };
  }

  it('builds and persists a normal summary payload through the v2 stats read path', async () => {
    const user = await createReadyUser();
    const { today } = await seedThreeLegacyEntries(user.id);

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
      mood: 3.33,
      energy: 3.33,
      stress: 3.67,
      sleepHours: 7,
      sleepQuality: 4,
    });
    expect(payload.patternInsights).toBeNull();
    expect(ctx.summariesRepository.summaries).toHaveLength(1);
    expect(text).toContain(telegramCopy.stats.titlePrefix);
    expect(text).toContain(telegramCopy.stats.daysLabel);
  });

  it('shows v2 optional metrics in the stats text independently from current settings', async () => {
    const user = await createReadyUser();
    const { firstEntry, secondEntry, thirdEntry } = await seedThreeLegacyEntries(user.id);

    await attachV2MetricValues(firstEntry.id, { motivation: 3 });
    await attachV2MetricValues(secondEntry.id, { motivation: 4, overall_state: 3 });
    await attachV2MetricValues(thirdEntry.id, { motivation: 5, overall_state: 4 });
    await ctx.usersService.setTrackedMetric(user.id, 'motivation', false);

    const payload = await ctx.summariesService.generateSummary(user.id, SummaryPeriodType.d7, {
      timezone: user.timezone,
      persist: false,
    });
    const text = ctx.summariesService.formatSummaryText(payload);

    expect(payload.extraMetricAverages).toEqual([
      {
        key: 'motivation',
        label: 'Мотивация',
        average: 4,
        observationsCount: 3,
      },
      {
        key: 'overall_state',
        label: 'Общее состояние',
        average: 3.5,
        observationsCount: 2,
      },
    ]);
    expect(text).toContain(telegramCopy.stats.extraMetricsLabel);
    expect(text).toContain('- Мотивация: 4.00');
    expect(text).toContain('- Общее состояние: 3.50');
  });

  it('renders an optional-only stats summary without legacy core noise or best-day blocks', async () => {
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

    await attachV2MetricValues(firstEntry.id, { motivation: 3, overall_state: 2 });
    await attachV2MetricValues(secondEntry.id, { motivation: 4, overall_state: 3 });
    await attachV2MetricValues(thirdEntry.id, { motivation: 5, overall_state: 4 });

    const payload = await ctx.summariesService.generateSummary(user.id, SummaryPeriodType.d7, {
      timezone: user.timezone,
      persist: false,
    });
    const text = ctx.summariesService.formatSummaryText(payload);

    expect(payload.bestDay).toBeNull();
    expect(payload.worstDay).toBeNull();
    expect(payload.extraMetricAverages).toEqual([
      expect.objectContaining({ key: 'motivation', average: 4 }),
      expect.objectContaining({ key: 'overall_state', average: 3 }),
    ]);
    expect(text).toContain(`${telegramCopy.stats.averagesLabel}:`);
    expect(text).toContain('- Мотивация: 4.00');
    expect(text).toContain('- Общее состояние: 3.00');
    expect(text).not.toContain(`- ${STATS_METRIC_LABELS.mood}:`);
    expect(text).not.toContain(`- ${STATS_METRIC_LABELS.energy}:`);
    expect(text).not.toContain(`- ${STATS_METRIC_LABELS.calm}:`);
    expect(text).not.toContain(telegramCopy.stats.bestDayLabel);
    expect(text).not.toContain(telegramCopy.stats.worstDayLabel);
  });

  it('renders the best/worst day block for a mood-only dataset after legacy mapping', async () => {
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
      moodScore: 4,
      energyScore: null,
      stressScore: null,
    });
    expect(payload.worstDay).toMatchObject({
      date: expect.any(String),
      moodScore: 3,
      energyScore: null,
      stressScore: null,
    });
    expect(text).toContain(telegramCopy.stats.bestDayLabel);
    expect(text).toContain(telegramCopy.stats.worstDayLabel);
  });

  it('keeps mixed summary semantics on the all-time stats path with v2 optional metrics', async () => {
    const user = await createReadyUser();

    const firstEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date('2026-03-05T00:00:00.000Z'), {
      moodScore: 5,
      energyScore: 5,
      stressScore: 6,
      sleepHours: 6.5,
      sleepQuality: 3,
    });
    const secondEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date('2026-03-09T00:00:00.000Z'), {
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
      sleepHours: 7,
      sleepQuality: 4,
    });
    const thirdEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date('2026-03-12T00:00:00.000Z'), {
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
      sleepHours: 7.5,
      sleepQuality: 5,
    });

    await attachV2MetricValues(firstEntry.id, { motivation: 3 });
    await attachV2MetricValues(secondEntry.id, { motivation: 4, overall_state: 3 });
    await attachV2MetricValues(thirdEntry.id, { motivation: 5, overall_state: 4 });

    const payload = await ctx.summariesService.generateSummary(user.id, SummaryPeriodType.all, {
      timezone: user.timezone,
      persist: false,
    });
    const text = ctx.summariesService.formatSummaryText(payload);

    expect(payload.entriesCount).toBe(3);
    expect(payload.averages).toMatchObject({
      mood: 3.33,
      energy: 3.33,
      stress: 3.67,
    });
    expect(payload.extraMetricAverages).toEqual([
      {
        key: 'motivation',
        label: 'Мотивация',
        average: 4,
        observationsCount: 3,
      },
      {
        key: 'overall_state',
        label: 'Общее состояние',
        average: 3.5,
        observationsCount: 2,
      },
    ]);
    expect(text).toContain('- Мотивация: 4.00');
    expect(text).toContain('- Общее состояние: 3.50');
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
        moodScore: 6,
        energyScore: isHighSleepDay ? 10 : 3,
        stressScore: 5,
        sleepHours: isHighSleepDay ? 8 : 5,
        sleepQuality: 4,
      });
    }

    for (let index = 7; index < 14; index += 1) {
      const entryDate = new Date(today.getTime() - index * 24 * 60 * 60 * 1000);

      await ctx.checkinsRepository.upsertByUserAndDate(user.id, entryDate, {
        moodScore: 5,
        energyScore: 4,
        stressScore: 6,
        sleepHours: 6,
        sleepQuality: 4,
      });
    }

    const payload = await ctx.summariesService.generateSummary(user.id, SummaryPeriodType.d7, {
      timezone: user.timezone,
      persist: false,
    });
    const text = ctx.summariesService.formatSummaryText(payload);

    expect(payload.isLowData).toBe(false);
    expect(payload.deltaVsPreviousPeriod).toMatchObject({
      mood: 0,
      energy: 1.29,
      stress: 0,
      sleepHours: 0.29,
      sleepQuality: 0,
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

    const router = createRouter({
      generateSelectedMetricChart: jest.fn().mockResolvedValue(Buffer.from('selected-chart')),
    });
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
      sleepQuality: 4,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: 7,
      energyScore: 6,
      stressScore: 4,
      sleepHours: 7,
      sleepQuality: 4,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: 8,
      energyScore: 7,
      stressScore: 4,
      sleepHours: 7,
      sleepQuality: 4,
    });

    const router = createRouter({
      generateSelectedMetricChart: jest.fn().mockRejectedValue(new Error('chart failed')),
    });
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
    await seedThreeLegacyEntries(user.id);
    const router = createRouter({
      generateSelectedMetricChart: jest.fn().mockResolvedValue(Buffer.from('selected')),
    });
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
