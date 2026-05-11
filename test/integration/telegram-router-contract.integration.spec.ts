import { Logger } from '@nestjs/common';

import { TELEGRAM_CALLBACKS, TELEGRAM_MAIN_MENU_BUTTONS } from '../../src/common/constants/app.constants';
import { FSM_STATES } from '../../src/fsm/fsm.types';
import { TELEGRAM_COMMANDS, telegramCopy } from '../../src/telegram/telegram.copy';
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
        'menu',
        'settings',
        'stats',
        'terms',
      ]);
      expect(TELEGRAM_COMMANDS[1]?.command).toBe('menu');
      expect(TELEGRAM_COMMANDS.map((command) => command.description)).toEqual([
        '👋 Старт и вход в бота',
        '🧭 Меню навигации',
        '❔ Краткая помощь',
        '📄 Пользовательское соглашение',
        '🌤 Отметить состояние',
        '🗂 Добавить событие',
        '📚 Последние записи',
        '📊 Сводка и графики',
        '⚙️ Настройки',
      ]);
      expect(Object.keys(handlers.hears)).toEqual([...TELEGRAM_MAIN_MENU_BUTTONS]);
      expect(Object.keys(handlers.events).sort()).toEqual(['callback_query', 'text']);
      expect(checkinsFlow.start).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('event=telegram_route_failed routeKey=checkin updateType=message'),
        expect.any(String),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('userId=user-router-contract-1 fsmState=checkin_mood'),
        expect.any(String),
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('event=telegram_fsm_reset_after_error'));
      expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.idle);
      expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.common.unexpectedError, expect.any(Object));
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('shows the navigation menu with inline section buttons', async () => {
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8910),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleMenuCommand(telegramCtx);

    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);

    const [message, extra] = telegramCtx.reply.mock.calls[0] as [
      string,
      { parse_mode?: string; reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string; text: string }>> } },
    ];
    const buttons = extra.reply_markup?.inline_keyboard?.flat() ?? [];

    expect(message).toBe(telegramCopy.menu.text);
    expect(extra.parse_mode).toBe('HTML');
    expect(buttons.map((button) => button.callback_data)).toEqual([
      TELEGRAM_CALLBACKS.menuStats,
      TELEGRAM_CALLBACKS.menuHistory,
      TELEGRAM_CALLBACKS.menuSettings,
      TELEGRAM_CALLBACKS.menuHelp,
      TELEGRAM_CALLBACKS.menuTerms,
    ]);
  });

  it('opens menu callback sections by editing the current inline message', async () => {
    await createReadyUser('user-router-contract-menu', 8911);
    const router = createRouter();

    async function runMenuCallback(callbackData: string) {
      const telegramCtx = {
        ...buildBaseContext(8911),
        callbackQuery: { data: callbackData },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageText: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
      };

      await (router as any).handleCallbackQuery(telegramCtx);
      return telegramCtx;
    }

    const statsCtx = await runMenuCallback(TELEGRAM_CALLBACKS.menuStats);
    expect(statsCtx.editMessageText).toHaveBeenCalledWith(
      telegramCopy.stats.periodPrompt,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect(await ctx.fsmService.getState('user-router-contract-menu')).toBe(FSM_STATES.stats_period_select);

    const historyCtx = await runMenuCallback(TELEGRAM_CALLBACKS.menuHistory);
    expect(historyCtx.editMessageText).toHaveBeenCalledWith(
      telegramCopy.history.empty,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    const settingsCtx = await runMenuCallback(TELEGRAM_CALLBACKS.menuSettings);
    expect((settingsCtx.editMessageText.mock.calls[0] as [string])[0]).toContain(telegramCopy.settings.title);
    expect(await ctx.fsmService.getState('user-router-contract-menu')).toBe(FSM_STATES.settings_menu);

    const helpCtx = await runMenuCallback(TELEGRAM_CALLBACKS.menuHelp);
    expect(helpCtx.editMessageText).toHaveBeenCalledWith(
      telegramCopy.help.text,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    const termsCtx = await runMenuCallback(TELEGRAM_CALLBACKS.menuTerms);
    expect((termsCtx.editMessageText.mock.calls[0] as [string])[0]).toContain(telegramCopy.terms.title);
  });

  it('updates the tag selection callback screen instead of sending a new message', async () => {
    const user = await createReadyUser('user-router-contract-tags', 8912);
    await ctx.fsmService.setState(user.id, FSM_STATES.checkin_tags, { selectedTagIds: [] });
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8912),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.checkinTagsTogglePrefix}tag-1`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.editMessageText).toHaveBeenCalledTimes(1);
    expect(telegramCtx.reply).not.toHaveBeenCalled();

    const [message, extra] = telegramCtx.editMessageText.mock.calls[0] as [
      string,
      { parse_mode?: string; reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> } },
    ];
    const buttonTexts = extra.reply_markup?.inline_keyboard?.flat().map((button) => button.text) ?? [];

    expect(message).toContain('Выбрано: <b>1 тег</b>');
    expect(extra.parse_mode).toBe('HTML');
    expect(buttonTexts.some((text) => text.startsWith('✅ '))).toBe(true);
  });

  it('falls back to a normal reply when an inline screen cannot be edited', async () => {
    const user = await createReadyUser('user-router-contract-tags-fallback', 8913);
    await ctx.fsmService.setState(user.id, FSM_STATES.checkin_tags, { selectedTagIds: [] });
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8913),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.checkinTagsTogglePrefix}tag-1`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockRejectedValue(new Error('message to edit not found')),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.editMessageText).toHaveBeenCalledTimes(1);
    expect(telegramCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Выбрано: <b>1 тег</b>'),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
  });

  it('returns from stats cancel to the navigation menu by editing the current screen', async () => {
    const user = await createReadyUser('user-router-contract-stats-cancel', 8914);
    await ctx.fsmService.setState(user.id, FSM_STATES.stats_period_select, {});
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8914),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.actionCancel,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.idle);
    expect(telegramCtx.editMessageText).toHaveBeenCalledWith(
      telegramCopy.menu.text,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect(telegramCtx.reply).not.toHaveBeenCalled();
  });

  it('deletes the current check-in callback screen before the final confirmation', async () => {
    const user = await createReadyUser('user-router-contract-checkin-delete', 8915);
    await ctx.fsmService.setState(user.id, FSM_STATES.checkin_add_event_confirm, {
      moodScore: 7,
      isUpdate: false,
    });
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8915),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.actionSkip,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
      editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.deleteMessage).toHaveBeenCalledTimes(1);
    expect(telegramCtx.editMessageReplyMarkup).not.toHaveBeenCalled();
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toContain('Запись за сегодня сохранена');
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.idle);
  });

  it('shows navigation menu after the first onboarding check-in is saved', async () => {
    const user = await createReadyUser('user-router-contract-first-checkin-menu', 8918);
    await ctx.fsmService.setState(user.id, FSM_STATES.checkin_add_event_confirm, {
      moodScore: 8,
      showMenuAfterSave: true,
    });
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8918),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.actionSkip,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
      editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.reply).toHaveBeenCalledTimes(2);
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toContain('Запись за сегодня сохранена');
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(
      2,
      telegramCopy.menu.text,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    const [, extra] = telegramCtx.reply.mock.calls[1] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];
    const callbacks = extra.reply_markup?.inline_keyboard?.flat().map((button) => button.callback_data) ?? [];

    expect(callbacks).toEqual([
      TELEGRAM_CALLBACKS.menuStats,
      TELEGRAM_CALLBACKS.menuHistory,
      TELEGRAM_CALLBACKS.menuSettings,
      TELEGRAM_CALLBACKS.menuHelp,
      TELEGRAM_CALLBACKS.menuTerms,
    ]);
  });

  it('cleans up event text input prompts and keeps back-only navigation on the next step', async () => {
    const user = await createReadyUser('user-router-contract-event-cleanup', 8916);
    await ctx.fsmService.setState(user.id, FSM_STATES.event_title, {
      eventFlowSource: 'standalone',
      eventType: 'work',
      eventStartDateKey: '2026-03-12',
      telegramPromptMessageId: 501,
    });
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8916),
      chat: { id: 8916 },
      message: {
        message_id: 901,
        text: 'успешная работа',
        chat: { id: 8916 },
      },
      telegram: {
        deleteMessage: jest.fn().mockResolvedValue(undefined),
      },
      deleteMessage: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue({ message_id: 502 }),
    };

    await (router as any).handleTextMessage(telegramCtx);

    expect(telegramCtx.telegram.deleteMessage).toHaveBeenCalledWith(8916, 501);
    expect(telegramCtx.deleteMessage).toHaveBeenCalledWith();
    expect(telegramCtx.reply).toHaveBeenCalledWith(
      telegramCopy.event.scorePrompt,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    const [, extra] = telegramCtx.reply.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> } },
    ];
    const buttonTexts = extra.reply_markup?.inline_keyboard?.flat().map((button) => button.text) ?? [];
    const session = await ctx.fsmService.getSession(user.id);

    expect(buttonTexts).toContain(telegramCopy.buttons.back);
    expect(buttonTexts).not.toContain(telegramCopy.buttons.cancel);
    expect(session?.payloadJson).toMatchObject({
      telegramPromptMessageId: 502,
      eventTitle: 'успешная работа',
    });
  });

  it('uses "Далее" instead of "Пропустить" on optional event details', async () => {
    const user = await createReadyUser('user-router-contract-event-next', 8917);
    await ctx.fsmService.setState(user.id, FSM_STATES.event_score, {
      eventFlowSource: 'standalone',
      eventType: 'work',
      eventTitle: 'успешная работа',
      eventStartDateKey: '2026-03-12',
      telegramPromptMessageId: 601,
    });
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8917),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.scorePrefix}7`,
        message: {
          message_id: 601,
          chat: { id: 8917 },
        },
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const [message, extra] = telegramCtx.editMessageText.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> } },
    ];
    const buttonTexts = extra.reply_markup?.inline_keyboard?.flat().map((button) => button.text) ?? [];

    expect(message).toBe(telegramCopy.event.descriptionPrompt);
    expect(buttonTexts).toContain(telegramCopy.buttons.back);
    expect(buttonTexts).toContain(telegramCopy.buttons.next);
    expect(buttonTexts).not.toContain(telegramCopy.buttons.skip);
    expect(buttonTexts).not.toContain(telegramCopy.buttons.cancel);
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
