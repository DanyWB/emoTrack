import { SleepMode } from '@prisma/client';

import { TELEGRAM_CALLBACKS } from '../../src/common/constants/app.constants';
import { FSM_STATES } from '../../src/fsm/fsm.types';
import { SLEEP_MODE_LABELS, telegramCopy } from '../../src/telegram/telegram.copy';
import { TelegramRouter } from '../../src/telegram/telegram.router';
import { buildUser } from '../helpers/in-memory';
import { createIntegrationTestContext, type IntegrationTestContext } from '../helpers/test-context';

describe('Settings integration', () => {
  let ctx: IntegrationTestContext;

  beforeEach(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterEach(async () => {
    await ctx.moduleRef.close();
  });

  function createRouter(): TelegramRouter {
    return new TelegramRouter(
      ctx.usersService,
      ctx.onboardingFlow,
      ctx.checkinsFlow,
      ctx.checkinsService,
      ctx.eventsFlow,
      ctx.summariesService,
      {
        generatePeriodCharts: jest.fn(),
      } as never,
      ctx.remindersService,
      ctx.fsmService,
      ctx.analyticsService,
      ctx.adminService,
    );
  }

  async function createReadyUser(overrides: Partial<ReturnType<typeof buildUser>> = {}) {
    return ctx.usersRepository.create(
      buildUser({
        id: overrides.id,
        telegramId: overrides.telegramId,
        onboardingCompleted: true,
        consentGiven: true,
        reminderTime: overrides.reminderTime ?? '21:30',
        remindersEnabled: overrides.remindersEnabled,
        checkinV2OnboardingCompleted: true,
        sleepMode: overrides.sleepMode,
        trackMood: overrides.trackMood,
        trackEnergy: overrides.trackEnergy,
        trackStress: overrides.trackStress,
        trackSleep: overrides.trackSleep,
      }),
    );
  }

  function buildBaseContext(telegramId: number) {
    return {
      from: {
        id: telegramId,
        username: 'tester',
        first_name: 'Test',
        language_code: 'ru',
      },
    };
  }

  it('shows a clear settings screen and honest reminder runtime state when jobs are disabled', async () => {
    const user = await createReadyUser({
      id: 'user-settings-1',
      telegramId: BigInt(7201),
      remindersEnabled: true,
      sleepMode: SleepMode.both,
    });
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(7201),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleSettingsCommand(telegramCtx);

    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);
    const [message] = telegramCtx.reply.mock.calls[0] as [string];

    expect(message).toContain(telegramCopy.settings.title);
    expect(message).toContain(telegramCopy.settings.remindersSectionTitle);
    expect(message).toContain(telegramCopy.settings.checkinSectionTitle);
    expect(message).toContain(telegramCopy.settings.remindersEnabled);
    expect(message).toContain(telegramCopy.settings.remindersRuntimeUnavailable);
    expect(message).toContain(`${telegramCopy.settings.reminderTimeLabel}: 21:30`);
    expect(message).toContain(
      `${telegramCopy.settings.weeklyDigestLabel}: ${telegramCopy.settings.weeklyDigestUnavailable}`,
    );
    expect(message).toContain(`${telegramCopy.settings.sleepModeLabel}: ${SLEEP_MODE_LABELS.both}`);
    expect(message).toContain(
      `${telegramCopy.settings.dailyTrackingLabel}: настроение, энергия, спокойствие, мотивация, общее состояние, сон`,
    );
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.settings_menu);
    expect(ctx.analyticsRepository.events.map((event) => event.eventName)).toContain('settings_opened');
  });

  it('opens a dedicated daily-metrics submenu and lazily syncs user tracked metrics', async () => {
    const user = await createReadyUser({
      id: 'user-settings-2a',
      telegramId: BigInt(7292),
      remindersEnabled: true,
      sleepMode: SleepMode.both,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });

    const telegramCtx = {
      ...buildBaseContext(7292),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.settingsDailyMetricsOpen,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const trackedMetrics = ctx.dailyMetricsRepository.listUserTrackedMetrics(user.id);
    const [submenuText, submenuExtra] = telegramCtx.reply.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> } },
    ];
    const metricRows = submenuExtra.reply_markup?.inline_keyboard?.slice(0, 5) ?? [];
    const session = await ctx.fsmService.getSession(user.id);

    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);
    expect(submenuText).toContain(telegramCopy.settings.dailyMetricsTitle);
    expect(submenuText).toContain(telegramCopy.settings.dailyMetricsHint);
    expect(submenuText).toContain(`${telegramCopy.settings.dailyMetricsActiveLabel}: мотивация, общее состояние`);
    expect(submenuText).toContain('• Настроение: всегда вкл');
    expect(submenuText).toContain('• Энергия: всегда вкл');
    expect(submenuText).toContain('• Спокойствие: всегда вкл');
    expect(submenuText).toContain('• Сон: вкл');
    expect(submenuText).toContain('Ясность головы');
    expect(metricRows.every((row) => row.length === 1)).toBe(true);
    expect(metricRows.map((row) => row[0]?.text)).toEqual([
      '✅ Мотивация',
      '✅ Общее состояние',
      '⬜ Ясность головы',
      '⬜ Желание общаться',
      '⬜ Физическое состояние',
    ]);
    expect(trackedMetrics).toHaveLength(9);
    expect(session?.payloadJson).toEqual({ settingsView: 'daily_metrics' });
  });

  it('opens the sleep-mode submenu with back only and without a generic cancel button', async () => {
    const user = await createReadyUser({
      id: 'user-settings-sleep-menu',
      telegramId: BigInt(7297),
      remindersEnabled: true,
      sleepMode: SleepMode.both,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });

    const telegramCtx = {
      ...buildBaseContext(7297),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.settingsSleepModeSelect,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const session = await ctx.fsmService.getSession(user.id);
    const [, extra] = telegramCtx.editMessageText.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];
    const callbacks = extra.reply_markup?.inline_keyboard?.flat().map((button) => button.callback_data) ?? [];

    expect(session?.payloadJson).toEqual({ settingsAwaiting: 'sleep_mode', settingsView: 'main' });
    expect(callbacks).toContain(TELEGRAM_CALLBACKS.actionBack);
    expect(callbacks).not.toContain(TELEGRAM_CALLBACKS.actionCancel);
  });

  it('opens reminder-time edit with back only and returns to settings on back', async () => {
    const user = await createReadyUser({
      id: 'user-settings-reminder-back',
      telegramId: BigInt(7298),
      remindersEnabled: true,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });

    const editCtx = {
      ...buildBaseContext(7298),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.settingsReminderTimeEdit,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(editCtx);

    const [, editExtra] = editCtx.editMessageText.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];
    const editCallbacks = editExtra.reply_markup?.inline_keyboard?.flat().map((button) => button.callback_data) ?? [];

    expect(editCallbacks).toEqual([TELEGRAM_CALLBACKS.actionBack]);
    expect((await ctx.fsmService.getSession(user.id))?.payloadJson).toEqual({
      settingsAwaiting: 'reminder_time',
      settingsView: 'main',
    });

    const backCtx = {
      ...buildBaseContext(7298),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.actionBack,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(backCtx);

    expect((await ctx.fsmService.getSession(user.id))?.payloadJson).toEqual({ settingsView: 'main' });
    expect((backCtx.editMessageText.mock.calls[0] as [string])[0]).toContain(telegramCopy.settings.title);
  });

  it('rejects disabling a core metric from the dedicated submenu', async () => {
    const user = await createReadyUser({
      id: 'user-settings-2b',
      telegramId: BigInt(7293),
      remindersEnabled: true,
      trackMood: true,
      trackEnergy: true,
      trackStress: true,
      trackSleep: true,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, {
      settingsView: 'daily_metrics',
    });

    const telegramCtx = {
      ...buildBaseContext(7293),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.settingsDailyMetricTogglePrefix}mood`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const updatedUser = await ctx.usersService.findById(user.id);
    const trackedMetrics = ctx.dailyMetricsRepository.listUserTrackedMetrics(user.id);
    const moodMetric = trackedMetrics.find((metric) => metric.metricDefinition.key === 'mood');

    expect(updatedUser?.trackMood).toBe(true);
    expect(moodMetric?.isEnabled).toBe(true);
    expect(telegramCtx.reply).toHaveBeenCalledTimes(2);
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toBe('Основные метрики check-in нельзя выключить.');
    expect((telegramCtx.reply.mock.calls[1] as [string])[0]).toContain('• Настроение: всегда вкл');
  });

  it('enables an optional score metric from the dedicated submenu', async () => {
    const user = await createReadyUser({
      id: 'user-settings-2bx',
      telegramId: BigInt(7296),
      remindersEnabled: true,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, {
      settingsView: 'daily_metrics',
    });

    const telegramCtx = {
      ...buildBaseContext(7296),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.settingsDailyMetricTogglePrefix}clarity`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const trackedMetrics = ctx.dailyMetricsRepository.listUserTrackedMetrics(user.id);
    const clarityMetric = trackedMetrics.find((metric) => metric.metricDefinition.key === 'clarity');
    const preferences = await ctx.dailyMetricsRepository.findUserMetricPreferences(user.id);
    const clarityPreference = preferences.find((preference) => preference.metricKey === 'clarity');

    expect(clarityMetric?.isEnabled).toBe(true);
    expect(clarityPreference?.enabled).toBe(true);
    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toContain('• Ясность головы: вкл');
  });

  it('rejects enabling more than three optional metrics from the submenu', async () => {
    const user = await createReadyUser({
      id: 'user-settings-2c',
      telegramId: BigInt(7294),
      remindersEnabled: true,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, {
      settingsView: 'daily_metrics',
    });

    const firstCtx = {
      ...buildBaseContext(7294),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.settingsDailyMetricTogglePrefix}clarity`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(firstCtx);

    const secondCtx = {
      ...buildBaseContext(7294),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.settingsDailyMetricTogglePrefix}social`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(secondCtx);

    const preferences = await ctx.dailyMetricsRepository.findUserMetricPreferences(user.id);
    const byKey = new Map(preferences.map((preference) => [preference.metricKey, preference.enabled] as const));

    expect(byKey.get('motivation')).toBe(true);
    expect(byKey.get('overall_state')).toBe(true);
    expect(byKey.get('clarity')).toBe(true);
    expect(byKey.get('social')).toBe(false);
    expect(secondCtx.reply).toHaveBeenCalledTimes(2);
    expect((secondCtx.reply.mock.calls[0] as [string])[0]).toBe(
      'Чтобы check-in оставался удобным, одновременно можно включить не больше 3 дополнительных метрик.',
    );
    expect((secondCtx.reply.mock.calls[1] as [string])[0]).toContain('• Ясность головы: вкл');
    expect((secondCtx.reply.mock.calls[1] as [string])[0]).toContain('• Желание общаться: выкл');
  });

  it('returns from the daily-metrics submenu back to the main settings screen', async () => {
    const user = await createReadyUser({
      id: 'user-settings-2d',
      telegramId: BigInt(7295),
      remindersEnabled: true,
      sleepMode: SleepMode.both,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, {
      settingsView: 'daily_metrics',
    });

    const telegramCtx = {
      ...buildBaseContext(7295),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.actionBack,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const session = await ctx.fsmService.getSession(user.id);
    const settingsText = (telegramCtx.reply.mock.calls[0] as [string])[0];

    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);
    expect(settingsText).toContain(telegramCopy.settings.title);
    expect(settingsText).toContain(telegramCopy.settings.remindersSectionTitle);
    expect(settingsText).toContain(telegramCopy.settings.checkinSectionTitle);
    expect(settingsText).toContain(
      `${telegramCopy.settings.dailyTrackingLabel}: настроение, энергия, спокойствие, мотивация, общее состояние, сон`,
    );
    expect(session?.payloadJson).toEqual({ settingsView: 'main' });
  });

  it('enables reminders and returns to the updated settings screen without implying background delivery is active', async () => {
    const user = await createReadyUser({
      id: 'user-settings-3',
      telegramId: BigInt(7202),
      remindersEnabled: false,
      sleepMode: SleepMode.hours,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });

    const telegramCtx = {
      ...buildBaseContext(7202),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.settingsRemindersToggle,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const updatedUser = await ctx.usersService.findById(user.id);
    const session = await ctx.fsmService.getSession(user.id);

    expect(telegramCtx.answerCbQuery).toHaveBeenCalled();
    expect(updatedUser?.remindersEnabled).toBe(true);
    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);

    const menuText = (telegramCtx.reply.mock.calls[0] as [string])[0];
    expect(menuText).toContain(telegramCopy.settings.remindersEnabled);
    expect(menuText).toContain(telegramCopy.settings.remindersRuntimeUnavailable);
    expect(menuText).toContain(
      `${telegramCopy.settings.weeklyDigestLabel}: ${telegramCopy.settings.weeklyDigestUnavailable}`,
    );
    expect(menuText).toContain(`${telegramCopy.settings.sleepModeLabel}: ${SLEEP_MODE_LABELS.hours}`);
    expect(session?.payloadJson).toEqual({ settingsView: 'main' });
  });

  it('keeps reminder time validation strict and returns to the refreshed settings screen after a valid update', async () => {
    const user = await createReadyUser({
      id: 'user-settings-4',
      telegramId: BigInt(7203),
      remindersEnabled: true,
      sleepMode: SleepMode.both,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, {
      settingsAwaiting: 'reminder_time',
      settingsView: 'main',
    });

    const invalidCtx = {
      ...buildBaseContext(7203),
      message: {
        text: '25:61',
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleTextMessage(invalidCtx);

    expect(invalidCtx.reply).toHaveBeenCalledWith(telegramCopy.validation.invalidTime, expect.any(Object));
    expect((await ctx.usersService.findById(user.id))?.reminderTime).toBe('21:30');

    const validCtx = {
      ...buildBaseContext(7203),
      message: {
        text: '22:15',
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleTextMessage(validCtx);

    const updatedUser = await ctx.usersService.findById(user.id);
    const session = await ctx.fsmService.getSession(user.id);

    expect(updatedUser?.reminderTime).toBe('22:15');
    expect(validCtx.reply).toHaveBeenCalledTimes(2);
    expect((validCtx.reply.mock.calls[0] as [string])[0]).toBe(telegramCopy.settings.reminderTimeSavedWithoutDelivery);

    const menuText = (validCtx.reply.mock.calls[1] as [string])[0];
    expect(menuText).toContain(`${telegramCopy.settings.reminderTimeLabel}: 22:15`);
    expect(menuText).toContain(telegramCopy.settings.remindersRuntimeUnavailable);
    expect(menuText).toContain(
      `${telegramCopy.settings.weeklyDigestLabel}: ${telegramCopy.settings.weeklyDigestUnavailable}`,
    );
    expect(session?.payloadJson).toEqual({ settingsView: 'main' });
  });

  it('updates sleep mode and returns to the current settings screen', async () => {
    const user = await createReadyUser({
      id: 'user-settings-5',
      telegramId: BigInt(7204),
      remindersEnabled: true,
      sleepMode: SleepMode.both,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });

    const telegramCtx = {
      ...buildBaseContext(7204),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.settingsSleepModePrefix}quality`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const updatedUser = await ctx.usersService.findById(user.id);
    const session = await ctx.fsmService.getSession(user.id);

    expect(updatedUser?.sleepMode).toBe(SleepMode.quality);
    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);

    const menuText = (telegramCtx.reply.mock.calls[0] as [string])[0];
    expect(menuText).toContain(`${telegramCopy.settings.sleepModeLabel}: ${SLEEP_MODE_LABELS.quality}`);
    expect(menuText).toContain(telegramCopy.settings.remindersRuntimeUnavailable);
    expect(menuText).toContain(
      `${telegramCopy.settings.weeklyDigestLabel}: ${telegramCopy.settings.weeklyDigestUnavailable}`,
    );
    expect(session?.payloadJson).toEqual({ settingsView: 'main' });
  });
});
