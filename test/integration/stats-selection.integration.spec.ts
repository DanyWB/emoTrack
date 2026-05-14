import { SummaryPeriodType } from '@prisma/client';

import { TELEGRAM_CALLBACKS } from '../../src/common/constants/app.constants';
import { FSM_STATES } from '../../src/fsm/fsm.types';
import {
  STATS_METRIC_LABELS,
  formatStatsSelectedMetricChartCaption,
  formatStatsSleepChartCaption,
  telegramCopy,
} from '../../src/telegram/telegram.copy';
import { TelegramRouter } from '../../src/telegram/telegram.router';
import { buildUser } from '../helpers/in-memory';
import { createIntegrationTestContext, type IntegrationTestContext } from '../helpers/test-context';

describe('Stats metric selection integration', () => {
  let ctx: IntegrationTestContext;

  beforeEach(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterEach(async () => {
    await ctx.moduleRef.close();
  });

  function createRouter(chartsOverrides: Partial<{
    generateSelectedMetricChart: jest.Mock;
    renderSleepChart: jest.Mock;
  }> = {}): TelegramRouter {
    return new TelegramRouter(
      ctx.usersService,
      ctx.onboardingFlow,
      ctx.checkinsFlow,
      ctx.checkinsService,
      ctx.eventsFlow,
      ctx.summariesService,
      {
        generatePeriodCharts: jest.fn(),
        generateSelectedMetricChart: chartsOverrides.generateSelectedMetricChart ?? jest.fn().mockResolvedValue(undefined),
        renderSleepChart: chartsOverrides.renderSleepChart ?? jest.fn().mockResolvedValue(Buffer.from('sleep-chart')),
      } as never,
      ctx.remindersService,
      ctx.tagsService,
      ctx.fsmService,
      ctx.analyticsService,
      ctx.adminService,
    );
  }

  async function createReadyUser() {
    return ctx.usersRepository.create(
      buildUser({
        id: 'user-stats-select-1',
        telegramId: BigInt(8801),
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
      Object.entries(values).map(([key, value]) => ({
        metricDefinitionId: definitionsByKey.get(key)!,
        value,
      })),
    );
  }

  it('opens a metric selector after choosing the stats period and shows only enabled metrics', async () => {
    const user = await createReadyUser();
    await ctx.usersService.setTrackedMetric(user.id, 'stress', false);
    await ctx.usersService.setTrackedMetric(user.id, 'joy', true);

    const router = createRouter();
    const telegramCtx = {
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleStatsPeriodSelection(telegramCtx, user, SummaryPeriodType.d7);

    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.stats_metric_select);
    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toContain(telegramCopy.stats.metricPromptPrefix);
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toContain(telegramCopy.stats.metricPromptHint);

    const keyboard = (
      telegramCtx.reply.mock.calls[0] as [string, { reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> } }]
    )[1];
    const buttonTexts = keyboard.reply_markup?.inline_keyboard?.flat().map((button) => button.text) ?? [];

    expect(buttonTexts).toContain(STATS_METRIC_LABELS.mood);
    expect(buttonTexts).toContain(STATS_METRIC_LABELS.energy);
    expect(buttonTexts).toContain('Сон');
    expect(buttonTexts).toContain('Радость');
    expect(buttonTexts).not.toContain(STATS_METRIC_LABELS.stress);
  });

  it('renders a selected extra-metric summary and sends a selected metric chart', async () => {
    const user = await createReadyUser();
    await ctx.usersService.setTrackedMetric(user.id, 'joy', true);

    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

    const firstEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, twoDaysAgo, {
      moodScore: null,
      energyScore: null,
      stressScore: null,
    });
    const secondEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: null,
      energyScore: null,
      stressScore: null,
    });
    const thirdEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: null,
      energyScore: null,
      stressScore: null,
    });

    await attachEntryMetricValues(firstEntry.id, { joy: 7 });
    await attachEntryMetricValues(secondEntry.id, { joy: 8 });
    await attachEntryMetricValues(thirdEntry.id, { joy: 9 });

    const generateSelectedMetricChart = jest.fn().mockResolvedValue(Buffer.from('selected-chart'));
    const router = createRouter({ generateSelectedMetricChart });
    const telegramCtx = {
      reply: jest.fn().mockResolvedValue(undefined),
      replyWithPhoto: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleStatsMetricSelection(telegramCtx, user, SummaryPeriodType.d7, 'joy');

    expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.stats.loading);
    expect(
      telegramCtx.reply.mock.calls.some(
        ([message]: [string]) => typeof message === 'string' && message.includes('Радость'),
      ),
    ).toBe(true);
    expect(
      telegramCtx.reply.mock.calls.every(
        ([message]: [string]) => typeof message !== 'string' || !message.includes(telegramCopy.stats.bestDayLabel),
      ),
    ).toBe(true);
    expect(generateSelectedMetricChart).toHaveBeenCalledTimes(1);
    expect(telegramCtx.replyWithPhoto).toHaveBeenCalledWith(
      { source: Buffer.from('selected-chart') },
      { caption: formatStatsSelectedMetricChartCaption('Радость', SummaryPeriodType.d7) },
    );
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.idle);
  });

  it('uses the sleep chart path for the selected sleep metric', async () => {
    const user = await createReadyUser();
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

    await ctx.checkinsRepository.upsertByUserAndDate(user.id, twoDaysAgo, {
      moodScore: null,
      energyScore: null,
      stressScore: null,
      sleepHours: 6.5,
      sleepQuality: 5,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: null,
      energyScore: null,
      stressScore: null,
      sleepHours: 7,
      sleepQuality: 6,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: null,
      energyScore: null,
      stressScore: null,
      sleepHours: 7.5,
      sleepQuality: 8,
    });

    const renderSleepChart = jest.fn().mockResolvedValue(Buffer.from('sleep-chart'));
    const router = createRouter({ renderSleepChart });
    const telegramCtx = {
      reply: jest.fn().mockResolvedValue(undefined),
      replyWithPhoto: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleStatsMetricSelection(telegramCtx, user, SummaryPeriodType.d7, 'sleep');

    expect(renderSleepChart).toHaveBeenCalledTimes(1);
    expect(telegramCtx.replyWithPhoto).toHaveBeenCalledWith(
      { source: Buffer.from('sleep-chart') },
      { caption: formatStatsSleepChartCaption(SummaryPeriodType.d7) },
    );
  });

  it('keeps the low-data branch for selected-metric stats and skips charts', async () => {
    const user = await createReadyUser();
    await ctx.usersService.setTrackedMetric(user.id, 'joy', true);

    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const firstEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: null,
      energyScore: null,
      stressScore: null,
    });
    const secondEntry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: null,
      energyScore: null,
      stressScore: null,
    });

    await attachEntryMetricValues(firstEntry.id, { joy: 7 });
    await attachEntryMetricValues(secondEntry.id, { joy: 8 });

    const generateSelectedMetricChart = jest.fn().mockResolvedValue(Buffer.from('selected-chart'));
    const router = createRouter({ generateSelectedMetricChart });
    const telegramCtx = {
      reply: jest.fn().mockResolvedValue(undefined),
      replyWithPhoto: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleStatsMetricSelection(telegramCtx, user, SummaryPeriodType.d7, 'joy');

    expect(
      telegramCtx.reply.mock.calls.some(
        ([message]: [string]) => typeof message === 'string' && message.includes(telegramCopy.stats.lowDataLead),
      ),
    ).toBe(true);
    expect(generateSelectedMetricChart).not.toHaveBeenCalled();
    expect(telegramCtx.replyWithPhoto).not.toHaveBeenCalled();
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.idle);
  });

  it('returns from the metric selector back to the period selector', async () => {
    const user = await createReadyUser();
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.stats_metric_select, {
      statsPeriodType: SummaryPeriodType.d7,
    });

    const telegramCtx = {
      from: {
        id: 8801,
        is_bot: false,
        first_name: 'Stats',
      },
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.actionBack,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.stats_period_select);
    expect(telegramCtx.reply).toHaveBeenCalledWith(
      telegramCopy.stats.periodPrompt,
      expect.anything(),
    );
  });

  it('recovers from an unknown stats metric callback without generating a summary', async () => {
    const user = await createReadyUser();
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.stats_metric_select, {
      statsPeriodType: SummaryPeriodType.d7,
    });

    const telegramCtx = {
      from: {
        id: 8801,
        is_bot: false,
        first_name: 'Stats',
      },
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.statsMetricPrefix}unknown_metric`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.stats_metric_select);
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(1, telegramCopy.stats.metricUnavailable);
    expect((telegramCtx.reply.mock.calls[1] as [string])[0]).toContain(telegramCopy.stats.metricPromptPrefix);
    expect(
      telegramCtx.reply.mock.calls.some(
        ([message]: [string]) => typeof message === 'string' && message === telegramCopy.stats.loading,
      ),
    ).toBe(false);
    expect(ctx.summariesRepository.summaries).toEqual([]);
  });
});
