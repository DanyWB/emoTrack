import { TELEGRAM_CALLBACKS } from '../../src/common/constants/app.constants';
import { FSM_STATES } from '../../src/fsm/fsm.types';
import { telegramCopy } from '../../src/telegram/telegram.copy';
import { TelegramRouter } from '../../src/telegram/telegram.router';
import { buildUser } from '../helpers/in-memory';
import { createIntegrationTestContext, type IntegrationTestContext } from '../helpers/test-context';

describe('Telegram access integration', () => {
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

  it('shows the acceptance-first onboarding path on /start for a new user', async () => {
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8101),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleStartCommand(telegramCtx);

    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);

    const [message, extra] = telegramCtx.reply.mock.calls[0] as [
      string,
      { parse_mode?: string; reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];

    expect(message).toContain(telegramCopy.onboarding.intro);
    expect(message).toContain(telegramCopy.onboarding.disclaimer);
    expect(message).toContain(telegramCopy.onboarding.consentPrompt);
    expect(extra.parse_mode).toBe('HTML');
    expect(extra.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data).toBe(TELEGRAM_CALLBACKS.consentAccept);

    const user = await ctx.usersService.findByTelegramId(BigInt(8101));
    expect(user?.consentGiven).toBe(false);
    expect(await ctx.fsmService.getState(user!.id)).toBe(FSM_STATES.onboarding_consent);
  });

  it('shows /terms and offers acceptance before onboarding is complete', async () => {
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8102),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleTermsCommand(telegramCtx);

    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);

    const [message, extra] = telegramCtx.reply.mock.calls[0] as [
      string,
      { parse_mode?: string; reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];

    expect(message).toContain(telegramCopy.terms.title);
    expect(message).toContain(telegramCopy.terms.text);
    expect(message).toContain(telegramCopy.terms.acceptPrompt);
    expect(extra.parse_mode).toBe('HTML');
    expect(extra.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data).toBe(TELEGRAM_CALLBACKS.consentAccept);

    const user = await ctx.usersService.findByTelegramId(BigInt(8102));
    expect(await ctx.fsmService.getState(user!.id)).toBe(FSM_STATES.onboarding_consent);
  });

  it('blocks product commands before consent and redirects into the acceptance flow', async () => {
    await ctx.usersRepository.create(
      buildUser({
        id: 'user-access-1',
        telegramId: BigInt(8103),
        onboardingCompleted: false,
        consentGiven: false,
        reminderTime: null,
      }),
    );

    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8103),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCheckinCommand(telegramCtx);

    expect(telegramCtx.reply).toHaveBeenNthCalledWith(1, telegramCopy.terms.accessRequired, expect.any(Object));
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(2, telegramCopy.onboarding.consentPrompt, expect.any(Object));
    expect(await ctx.fsmService.getState('user-access-1')).toBe(FSM_STATES.onboarding_consent);
  });

  it('accepts terms from the callback flow and offers the daily reminder step', async () => {
    await ctx.usersRepository.create(
      buildUser({
        id: 'user-access-2',
        telegramId: BigInt(8104),
        onboardingCompleted: false,
        consentGiven: false,
        reminderTime: null,
      }),
    );
    await ctx.fsmService.setState('user-access-2', FSM_STATES.onboarding_consent, {});

    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8104),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.consentAccept,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const updatedUser = await ctx.usersService.findById('user-access-2');

    expect(updatedUser?.consentGiven).toBe(true);
    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);

    const [message, extra] = telegramCtx.reply.mock.calls[0] as [
      string,
      { parse_mode?: string; reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];

    expect(message).toBe(telegramCopy.onboarding.reminderPrompt);
    expect(extra.parse_mode).toBe('HTML');
    expect(extra.reply_markup?.inline_keyboard?.flat().map((button) => button.callback_data)).toEqual([
      TELEGRAM_CALLBACKS.onboardingReminderLater,
      TELEGRAM_CALLBACKS.actionCancel,
    ]);
    expect(await ctx.fsmService.getState('user-access-2')).toBe(FSM_STATES.onboarding_reminder_time);
  });

  it('lets a new user skip reminder setup and continue to the first check-in offer', async () => {
    const user = await ctx.usersService.getOrCreateTelegramUser({
      telegramId: BigInt(8107),
      username: 'tester',
      firstName: 'Test',
      languageCode: 'ru',
    });
    await ctx.usersService.setConsentGiven(user.id, true);
    await ctx.fsmService.setState(user.id, FSM_STATES.onboarding_reminder_time, {});

    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8107),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.onboardingReminderLater,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const updatedUser = await ctx.usersService.findById(user.id);

    expect(updatedUser).toMatchObject({
      onboardingCompleted: true,
      remindersEnabled: false,
      reminderTime: null,
    });
    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(
      1,
      telegramCopy.onboarding.firstCheckinOffer,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.onboarding_first_checkin);
  });

  it('lets an accepted ready user continue into product flows normally', async () => {
    await ctx.usersRepository.create(
      buildUser({
        id: 'user-access-3',
        telegramId: BigInt(8105),
        onboardingCompleted: true,
        consentGiven: true,
      }),
    );

    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8105),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCheckinCommand(telegramCtx);

    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toBe(telegramCopy.checkin.started);
    expect(
      telegramCtx.reply.mock.calls.every(([message]: [string]) => message !== telegramCopy.terms.accessRequired),
    ).toBe(true);
  });

  it('opens navigation menu on /start for a ready user', async () => {
    await ctx.usersRepository.create(
      buildUser({
        id: 'user-access-ready-start',
        telegramId: BigInt(8108),
        onboardingCompleted: true,
        consentGiven: true,
      }),
    );

    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8108),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleStartCommand(telegramCtx);

    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);

    const [message, extra] = telegramCtx.reply.mock.calls[0] as [
      string,
      { parse_mode?: string; reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];
    const callbacks = extra.reply_markup?.inline_keyboard?.flat().map((button) => button.callback_data) ?? [];

    expect(message).toBe(telegramCopy.startup.alreadyReady);
    expect(extra.parse_mode).toBe('HTML');
    expect(callbacks).toEqual([
      TELEGRAM_CALLBACKS.menuStats,
      TELEGRAM_CALLBACKS.menuHistory,
      TELEGRAM_CALLBACKS.menuSettings,
      TELEGRAM_CALLBACKS.menuHelp,
      TELEGRAM_CALLBACKS.menuTerms,
    ]);
  });

  it('keeps /help available before consent and includes /terms in the command list', async () => {
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8106),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleHelpCommand(telegramCtx);

    const [message] = telegramCtx.reply.mock.calls[0] as [string];
    expect(message).toContain('/terms');
    expect(message).toContain('/checkin');
  });
});
