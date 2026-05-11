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

    expect(telegramCtx.reply).toHaveBeenNthCalledWith(1, telegramCopy.onboarding.intro);
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(2, telegramCopy.onboarding.disclaimer);
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(3, telegramCopy.onboarding.consentPrompt, expect.any(Object));

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

    expect(telegramCtx.reply).toHaveBeenCalledTimes(2);
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toContain(telegramCopy.terms.title);
    expect((telegramCtx.reply.mock.calls[0] as [string])[0]).toContain(telegramCopy.terms.text);
    expect((telegramCtx.reply.mock.calls[1] as [string])[0]).toBe(telegramCopy.terms.acceptPrompt);

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

  it('accepts terms from the callback flow and unlocks the reminder-time step', async () => {
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
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(1, telegramCopy.onboarding.consentAccepted);
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(2, telegramCopy.onboarding.reminderPrompt, expect.any(Object));
    expect(await ctx.fsmService.getState('user-access-2')).toBe(FSM_STATES.onboarding_reminder_time);
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
