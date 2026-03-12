import { SummaryPeriodType } from '@prisma/client';

import { TelegramRouter } from '../../src/telegram/telegram.router';
import { telegramCopy } from '../../src/telegram/telegram.copy';
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
    expect(text).toContain('Сводка за период: 7 дней');
    expect(text).toContain('Опорные дни:');
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
    expect(text).toContain('Изменение к предыдущему периоду:');
    expect(text).toContain('Наблюдения:');
    expect(text).toContain('При более долгом сне энергия в среднем выше на 3.00.');
  });

  it('uses the low-data summary path and skips charts for sparse periods', async () => {
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
        generatePeriodCharts: jest.fn().mockResolvedValue({}),
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

    await (router as any).handleStatsPeriodSelection(telegramCtx, user, SummaryPeriodType.d7);

    expect(
      telegramCtx.reply.mock.calls.some(
        ([message]: [string]) =>
          typeof message === 'string' &&
          message.includes('Данных пока мало, поэтому сводка предварительная.'),
      ),
    ).toBe(true);
    expect(
      telegramCtx.reply.mock.calls.every(
        ([message]: [string]) =>
          typeof message !== 'string' ||
          (!message.includes('Изменение к предыдущему периоду:') && !message.includes('Наблюдения:')),
      ),
    ).toBe(true);
    expect(telegramCtx.replyWithPhoto).not.toHaveBeenCalled();
    expect(await ctx.fsmService.getState(user.id)).toBe('idle');
  });

  it('falls back to text summary when chart generation fails for a normal dataset', async () => {
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
        generatePeriodCharts: jest.fn().mockRejectedValue(new Error('chart failed')),
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

    await (router as any).handleStatsPeriodSelection(telegramCtx, user, SummaryPeriodType.d7);

    expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.stats.loading);
    expect(
      telegramCtx.reply.mock.calls.some(
        ([message]: [string]) => typeof message === 'string' && message.includes('Сводка за период: 7 дней'),
      ),
    ).toBe(true);
    expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.stats.chartUnavailable);
    expect(await ctx.fsmService.getState(user.id)).toBe('idle');

    const trackedEvents = ctx.analyticsRepository.events.map((event) => event.eventName);
    expect(trackedEvents).toEqual(expect.arrayContaining(['summary_sent', 'chart_generation_failed']));
  });

  it('sends chart images for a normal dataset when chart buffers are available', async () => {
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
        generatePeriodCharts: jest.fn().mockResolvedValue({
          combinedChartBuffer: Buffer.from('combined'),
          sleepChartBuffer: Buffer.from('sleep'),
        }),
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

    await (router as any).handleStatsPeriodSelection(telegramCtx, user, SummaryPeriodType.d7);

    expect(telegramCtx.replyWithPhoto).toHaveBeenCalledTimes(2);
    expect(telegramCtx.replyWithPhoto).toHaveBeenNthCalledWith(
      1,
      { source: Buffer.from('combined') },
      { caption: telegramCopy.stats.chartCombinedCaption },
    );
    expect(telegramCtx.replyWithPhoto).toHaveBeenNthCalledWith(
      2,
      { source: Buffer.from('sleep') },
      { caption: telegramCopy.stats.chartSleepCaption },
    );
  });
});
