import { Logger } from '@nestjs/common';

import { TELEGRAM_CALLBACKS, TELEGRAM_MAIN_MENU_BUTTONS } from '../../src/common/constants/app.constants';
import { FSM_STATES } from '../../src/fsm/fsm.types';
import { telegramCopy } from '../../src/telegram/telegram.copy';
import { TelegramRouter } from '../../src/telegram/telegram.router';
import { buildUser } from '../helpers/in-memory';
import { createIntegrationTestContext, type IntegrationTestContext } from '../helpers/test-context';

describe('Telegram router contract integration', () => {
  let ctx: IntegrationTestContext;

  beforeEach(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterEach(async () => {
    await ctx.moduleRef.close();
  });

  function createRouter(overrides: { checkinsFlow?: unknown } = {}): TelegramRouter {
    return new TelegramRouter(
      ctx.usersService,
      ctx.onboardingFlow,
      (overrides.checkinsFlow ?? ctx.checkinsFlow) as never,
      ctx.checkinsService,
      ctx.eventsFlow,
      ctx.summariesService,
      {
        generatePeriodCharts: jest.fn(),
        generateSelectedMetricChart: jest.fn().mockResolvedValue(undefined),
        renderSleepChart: jest.fn().mockResolvedValue(undefined),
      } as never,
      ctx.remindersService,
      ctx.tagsService,
      ctx.fsmService,
      ctx.analyticsService,
    );
  }

  function buildBaseContext(telegramId = 8901) {
    return {
      from: {
        id: telegramId,
        username: 'router_contract',
        first_name: 'Router',
        language_code: 'ru',
      },
    };
  }

  async function createReadyUser(id = 'user-router-contract-1', telegramId = 8901) {
    return ctx.usersRepository.create(
      buildUser({
        id,
        telegramId: BigInt(telegramId),
        onboardingCompleted: true,
        consentGiven: true,
        reminderTime: '21:30',
      }),
    );
  }

  it('registers command, menu, callback, and text handlers through the safe route wrapper', async () => {
    const user = await createReadyUser();
    await ctx.fsmService.setState(user.id, FSM_STATES.checkin_mood, {});
    const checkinsFlow = {
      ...ctx.checkinsFlow,
      start: jest.fn().mockRejectedValue(new Error('forced route failure')),
      cancel: ctx.checkinsFlow.cancel.bind(ctx.checkinsFlow),
      goBack: ctx.checkinsFlow.goBack.bind(ctx.checkinsFlow),
      skipCurrentStep: ctx.checkinsFlow.skipCurrentStep.bind(ctx.checkinsFlow),
      finalizeAfterEventSkip: ctx.checkinsFlow.finalizeAfterEventSkip.bind(ctx.checkinsFlow),
    };
    const router = createRouter({ checkinsFlow });
    const handlers: {
      start?: (ctx: unknown) => Promise<void>;
      commands: Record<string, (ctx: unknown) => Promise<void>>;
      hears: Record<string, (ctx: unknown) => Promise<void>>;
      events: Record<string, (ctx: unknown) => Promise<void>>;
    } = {
      commands: {},
      hears: {},
      events: {},
    };
    const bot = {
      start: jest.fn((handler) => {
        handlers.start = handler;
      }),
      command: jest.fn((command, handler) => {
        handlers.commands[command] = handler;
      }),
      hears: jest.fn((text, handler) => {
        handlers.hears[text] = handler;
      }),
      on: jest.fn((event, handler) => {
        handlers.events[event] = handler;
      }),
    };
    const telegramCtx = {
      ...buildBaseContext(),
      reply: jest.fn().mockResolvedValue(undefined),
    };
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    try {
      router.register(bot as never);
      await handlers.commands.checkin(telegramCtx);

      expect(bot.start).toHaveBeenCalledTimes(1);
      expect(Object.keys(handlers.commands).sort()).toEqual([
        'checkin',
        'event',
        'help',
        'history',
        'settings',
        'stats',
        'terms',
      ]);
      expect(Object.keys(handlers.hears)).toEqual([...TELEGRAM_MAIN_MENU_BUTTONS]);
      expect(Object.keys(handlers.events).sort()).toEqual(['callback_query', 'text']);
      expect(checkinsFlow.start).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telegram route failed: checkin'),
        expect.any(String),
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('FSM session reset after unexpected error'));
      expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.idle);
      expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.common.unexpectedError, expect.any(Object));
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('blocks non-consent callbacks before terms are accepted', async () => {
    await ctx.usersRepository.create(
      buildUser({
        id: 'user-router-contract-2',
        telegramId: BigInt(8902),
        onboardingCompleted: false,
        consentGiven: false,
        reminderTime: null,
      }),
    );
    await ctx.fsmService.setState('user-router-contract-2', FSM_STATES.stats_period_select, {});
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8902),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.statsPeriodPrefix}d7`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.answerCbQuery).toHaveBeenCalledTimes(1);
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(1, telegramCopy.terms.accessRequired, expect.any(Object));
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(2, telegramCopy.onboarding.consentPrompt, expect.any(Object));
    expect(await ctx.fsmService.getState('user-router-contract-2')).toBe(FSM_STATES.onboarding_consent);
  });

  it('recovers a stale stats metric callback by reopening the period selector', async () => {
    const user = await createReadyUser('user-router-contract-3', 8903);
    await ctx.fsmService.setState(user.id, FSM_STATES.stats_metric_select, {});
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8903),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.statsMetricPrefix}mood`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.stats_period_select);
    expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.stats.periodPrompt, expect.any(Object));
  });

  it('does not mutate tracked metrics from a stale daily-metrics callback', async () => {
    const user = await createReadyUser('user-router-contract-4', 8904);
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8904),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.settingsDailyMetricTogglePrefix}joy`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const trackedMetrics = await ctx.usersService.getTrackedMetrics(user.id);
    const joy = trackedMetrics.find((metric) => metric.key === 'joy');

    expect(joy?.enabled).toBe(false);
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.settings_menu);
    expect((await ctx.fsmService.getSession(user.id))?.payloadJson).toMatchObject({
      settingsView: 'daily_metrics',
    });
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(1, telegramCopy.settings.dailyMetricsStale);
    expect((telegramCtx.reply.mock.calls[1] as [string])[0]).toContain(telegramCopy.settings.dailyMetricsTitle);
  });
});
