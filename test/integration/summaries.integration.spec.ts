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
    expect(ctx.summariesRepository.summaries).toHaveLength(1);
    expect(text).toContain('Сводка за период: 7 дней');
    expect(text).toContain('Опорные дни:');
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
        ([message]: [string]) =>
          typeof message === 'string' && message.includes('Сводка за период: 7 дней'),
      ),
    ).toBe(true);
    expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.stats.chartUnavailable);
    expect(await ctx.fsmService.getState(user.id)).toBe('idle');

    const trackedEvents = ctx.analyticsRepository.events.map((event) => event.eventName);
    expect(trackedEvents).toEqual(expect.arrayContaining(['summary_sent', 'chart_generation_failed']));
  });
});
