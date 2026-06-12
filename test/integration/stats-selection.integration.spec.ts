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

  async function attachV2MetricValues(entryId: string, values: Record<string, number>): Promise<void> {
    await ctx.checkinsRepository.upsertV2MetricValues(
      entryId,
      Object.entries(values).map(([key, value]) => ({
        metricKey: key,
        ordinalValue: value,
      })),
    );
  }

  it('opens a metric selector after choosing the stats period and shows only enabled metrics', async () => {
    const user = await createReadyUser();

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
    expect(buttonTexts).toContain(STATS_METRIC_LABELS.calm);
    expect(buttonTexts).toContain('Сон');
    expect(buttonTexts).toContain('Мотивация');
    expect(buttonTexts).toContain('Общее состояние');
    expect(buttonTexts).not.toContain('Ясность головы');
  });

  it('renders a selected extra-metric summary and sends a selected metric chart', async () => {
    const user = await createReadyUser();

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

    await attachV2MetricValues(firstEntry.id, { motivation: 3 });
    await attachV2MetricValues(secondEntry.id, { motivation: 4 });
    await attachV2MetricValues(thirdEntry.id, { motivation: 5 });

    const generateSelectedMetricChart = jest.fn().mockResolvedValue(Buffer.from('selected-chart'));
    const router = createRouter({ generateSelectedMetricChart });
    const telegramCtx = {
      reply: jest.fn().mockResolvedValue(undefined),
      replyWithPhoto: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleStatsMetricSelection(telegramCtx, user, SummaryPeriodType.d7, 'motivation');

    expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.stats.loading);
    expect(
      telegramCtx.reply.mock.calls.some(
        ([message]: [string]) => typeof message === 'string' && message.includes('Мотивация'),
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
      { caption: formatStatsSelectedMetricChartCaption('Мотивация', SummaryPeriodType.d7) },
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
      sleepQuality: 3,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: null,
      energyScore: null,
      stressScore: null,
      sleepHours: 7,
      sleepQuality: 4,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: null,
      energyScore: null,
      stressScore: null,
      sleepHours: 7.5,
      sleepQuality: 5,
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

  it('edits the metric selector into a summary and keeps navigation for switching metrics', async () => {
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
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, yesterday, {
      moodScore: 6,
      energyScore: 6,
      stressScore: 4,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
    });
    await ctx.fsmService.setState(user.id, FSM_STATES.stats_metric_select, {
      statsPeriodType: SummaryPeriodType.d7,
      statsView: 'metrics',
    });

    const generateSelectedMetricChart = jest.fn().mockResolvedValue(Buffer.from('selected-chart'));
    const router = createRouter({ generateSelectedMetricChart });
    const telegramCtx = {
      from: {
        id: 8801,
        is_bot: false,
        first_name: 'Stats',
      },
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.statsMetricPrefix}mood`,
        message: {
          message_id: 501,
          chat: { id: 8801 },
        },
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      replyWithPhoto: jest.fn().mockResolvedValue({ message_id: 701 }),
      telegram: {
        deleteMessage: jest.fn().mockResolvedValue(undefined),
      },
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.reply).not.toHaveBeenCalled();
    expect(telegramCtx.editMessageText).toHaveBeenNthCalledWith(
      1,
      telegramCopy.stats.loading,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect((telegramCtx.editMessageText.mock.calls[1] as [string])[0]).toContain(STATS_METRIC_LABELS.mood);
    expect(telegramCtx.replyWithPhoto).toHaveBeenCalledTimes(1);

    const [, extra] = telegramCtx.editMessageText.mock.calls[1] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ text: string; callback_data: string }>> } },
    ];
    const buttons = extra.reply_markup?.inline_keyboard?.flat() ?? [];
    const session = await ctx.fsmService.getSession(user.id);

    expect(buttons.map((button) => button.text)).toEqual([
      telegramCopy.buttons.statsBackToMetrics,
      telegramCopy.buttons.statsChangePeriod,
      telegramCopy.buttons.toMenu,
    ]);
    expect(buttons.map((button) => button.callback_data)).toEqual([
      TELEGRAM_CALLBACKS.actionBack,
      TELEGRAM_CALLBACKS.statsBackToPeriods,
      TELEGRAM_CALLBACKS.menuHome,
    ]);
    expect(session?.payloadJson).toMatchObject({
      statsPeriodType: SummaryPeriodType.d7,
      statsView: 'summary',
      statsSelectedMetricKey: 'mood',
      statsChartMessageIds: [701],
    });
  });

  it('returns from a stats summary to metric selection and deletes old chart messages', async () => {
    const user = await createReadyUser();
    await ctx.fsmService.setState(user.id, FSM_STATES.stats_metric_select, {
      statsPeriodType: SummaryPeriodType.d7,
      statsView: 'summary',
      statsSelectedMetricKey: 'mood',
      statsChartMessageIds: [701],
    });

    const router = createRouter();
    const telegramCtx = {
      from: {
        id: 8801,
        is_bot: false,
        first_name: 'Stats',
      },
      chat: { id: 8801 },
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.actionBack,
        message: {
          message_id: 501,
          chat: { id: 8801 },
        },
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      telegram: {
        deleteMessage: jest.fn().mockResolvedValue(undefined),
      },
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.telegram.deleteMessage).toHaveBeenCalledWith(8801, 701);
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.stats_metric_select);
    expect((await ctx.fsmService.getSession(user.id))?.payloadJson).toMatchObject({
      statsPeriodType: SummaryPeriodType.d7,
      statsView: 'metrics',
      statsChartMessageIds: [],
    });
    expect((telegramCtx.editMessageText.mock.calls[0] as [string])[0]).toContain(telegramCopy.stats.metricPromptPrefix);
  });

  it('keeps the low-data branch for selected-metric stats and skips charts', async () => {
    const user = await createReadyUser();

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

    await attachV2MetricValues(firstEntry.id, { motivation: 3 });
    await attachV2MetricValues(secondEntry.id, { motivation: 4 });

    const generateSelectedMetricChart = jest.fn().mockResolvedValue(Buffer.from('selected-chart'));
    const router = createRouter({ generateSelectedMetricChart });
    const telegramCtx = {
      reply: jest.fn().mockResolvedValue(undefined),
      replyWithPhoto: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleStatsMetricSelection(telegramCtx, user, SummaryPeriodType.d7, 'motivation');

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
