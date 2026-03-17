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
      ctx.tagsService,
      ctx.fsmService,
      ctx.analyticsService,
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
    expect(message).toContain(telegramCopy.settings.remindersEnabled);
    expect(message).toContain(telegramCopy.settings.remindersRuntimeUnavailable);
    expect(message).toContain(`${telegramCopy.settings.reminderTimeLabel}: 21:30`);
    expect(message).toContain(`${telegramCopy.settings.sleepModeLabel}: ${SLEEP_MODE_LABELS.both}`);
    expect(message).toContain(`${telegramCopy.settings.dailyTrackingLabel}: настроение, энергия, стресс, сон`);
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.settings_menu);
    expect(ctx.analyticsRepository.events.map((event) => event.eventName)).toContain('settings_opened');
  });

  it('updates tracked daily metrics and refreshes the settings screen', async () => {
    const user = await createReadyUser({
      id: 'user-settings-2a',
      telegramId: BigInt(7292),
      remindersEnabled: true,
      sleepMode: SleepMode.both,
      trackMood: true,
      trackEnergy: true,
      trackStress: true,
      trackSleep: true,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, {});

    const telegramCtx = {
      ...buildBaseContext(7292),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.settingsTrackMoodToggle,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const updatedUser = await ctx.usersService.findById(user.id);

    expect(updatedUser?.trackMood).toBe(false);
    expect(telegramCtx.reply).toHaveBeenCalledTimes(2);
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toBe(telegramCopy.settings.dailyTrackingUpdated);
    expect((telegramCtx.reply.mock.calls[1] as [string])[0]).toContain(
      `${telegramCopy.settings.dailyTrackingLabel}: энергия, стресс, сон`,
    );
  });

  it('rejects disabling the last tracked daily metric', async () => {
    const user = await createReadyUser({
      id: 'user-settings-2b',
      telegramId: BigInt(7293),
      remindersEnabled: true,
      trackMood: true,
      trackEnergy: false,
      trackStress: false,
      trackSleep: false,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, {});

    const telegramCtx = {
      ...buildBaseContext(7293),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.settingsTrackMoodToggle,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const updatedUser = await ctx.usersService.findById(user.id);

    expect(updatedUser?.trackMood).toBe(true);
    expect(telegramCtx.reply).toHaveBeenCalledTimes(2);
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toBe(
      telegramCopy.validation.invalidDailyTrackingConfiguration,
    );
    expect((telegramCtx.reply.mock.calls[1] as [string])[0]).toContain(
      `${telegramCopy.settings.dailyTrackingLabel}: настроение`,
    );
  });

  it('enables reminders and returns to the updated settings screen without implying background delivery is active', async () => {
    const user = await createReadyUser({
      id: 'user-settings-2',
      telegramId: BigInt(7202),
      remindersEnabled: false,
      sleepMode: SleepMode.hours,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, {});

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
    expect(telegramCtx.reply).toHaveBeenCalledTimes(2);
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toBe(telegramCopy.settings.remindersEnabledWithoutDelivery);

    const menuText = (telegramCtx.reply.mock.calls[1] as [string])[0];
    expect(menuText).toContain(telegramCopy.settings.remindersEnabled);
    expect(menuText).toContain(telegramCopy.settings.remindersRuntimeUnavailable);
    expect(menuText).toContain(`${telegramCopy.settings.sleepModeLabel}: ${SLEEP_MODE_LABELS.hours}`);
    expect(session?.payloadJson).toEqual({});
  });

  it('keeps reminder time validation strict and returns to the refreshed settings screen after a valid update', async () => {
    const user = await createReadyUser({
      id: 'user-settings-3',
      telegramId: BigInt(7203),
      remindersEnabled: true,
      sleepMode: SleepMode.both,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, {
      settingsAwaiting: 'reminder_time',
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
    expect(session?.payloadJson).toEqual({});
  });

  it('updates sleep mode and returns to the current settings screen', async () => {
    const user = await createReadyUser({
      id: 'user-settings-4',
      telegramId: BigInt(7204),
      remindersEnabled: true,
      sleepMode: SleepMode.both,
    });
    const router = createRouter();
    await ctx.fsmService.setState(user.id, FSM_STATES.settings_menu, {});

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
    expect(telegramCtx.reply).toHaveBeenCalledTimes(2);
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toBe(telegramCopy.settings.sleepModeUpdated);

    const menuText = (telegramCtx.reply.mock.calls[1] as [string])[0];
    expect(menuText).toContain(`${telegramCopy.settings.sleepModeLabel}: ${SLEEP_MODE_LABELS.quality}`);
    expect(menuText).toContain(telegramCopy.settings.remindersRuntimeUnavailable);
    expect(session?.payloadJson).toEqual({});
  });
});
