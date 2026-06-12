import { Logger } from '@nestjs/common';
import { AnnouncementType } from '@prisma/client';

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

  function createRouter(overrides: {
    checkinsFlow?: unknown;
    supportService?: unknown;
    feedbackService?: unknown;
    announcementsService?: unknown;
  } = {}): TelegramRouter {
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
      ctx.fsmService,
      ctx.analyticsService,
      ctx.adminService,
      overrides.supportService as never,
      overrides.feedbackService as never,
      overrides.announcementsService as never,
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
        'admin',
        'checkin',
        'event',
        'feedback',
        'help',
        'history',
        'menu',
        'settings',
        'stats',
        'support',
        'terms',
        'yesterday',
      ]);
      expect(TELEGRAM_COMMANDS[1]?.command).toBe('menu');
      expect(TELEGRAM_COMMANDS.map((command) => command.command)).toEqual([
        'start',
        'menu',
        'help',
        'terms',
        'checkin',
        'yesterday',
        'event',
        'history',
        'stats',
        'settings',
        'feedback',
        'support',
      ]);
      expect(Object.keys(handlers.hears)).toEqual([...TELEGRAM_MAIN_MENU_BUTTONS]);
      expect(Object.keys(handlers.events).sort()).toEqual(['callback_query', 'photo', 'text']);
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
      TELEGRAM_CALLBACKS.menuFeedback,
      TELEGRAM_CALLBACKS.menuSupport,
      TELEGRAM_CALLBACKS.menuHelp,
      TELEGRAM_CALLBACKS.menuTerms,
    ]);
  });

  it('keeps the admin menu private and renders it for configured Telegram ids', async () => {
    const routerWithoutAdmin = createRouter();
    const deniedCtx = {
      ...buildBaseContext(8998),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (routerWithoutAdmin as any).handleAdminCommand(deniedCtx);

    expect(deniedCtx.reply).toHaveBeenCalledWith(
      telegramCopy.admin.accessDenied,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    await ctx.moduleRef.close();
    ctx = await createIntegrationTestContext({ admin: { telegramIds: [BigInt(8999)] } });

    const router = createRouter();
    const adminCtx = {
      ...buildBaseContext(8999),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleAdminCommand(adminCtx);

    const [message, extra] = adminCtx.reply.mock.calls[0] as [
      string,
      { parse_mode?: string; reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];
    const callbacks = extra.reply_markup?.inline_keyboard?.flat().map((button) => button.callback_data) ?? [];

    expect(message).toBe(telegramCopy.admin.menu);
    expect(extra.parse_mode).toBe('HTML');
      expect(callbacks).toEqual([
        TELEGRAM_CALLBACKS.adminOverview,
        `${TELEGRAM_CALLBACKS.adminActiveUsersPrefix}0`,
        `${TELEGRAM_CALLBACKS.adminFeedbackPrefix}0`,
        TELEGRAM_CALLBACKS.adminAnnouncementsMenu,
      ]);
  });

  it('opens admin overview and active users through callbacks', async () => {
    await ctx.moduleRef.close();
    ctx = await createIntegrationTestContext({ admin: { telegramIds: [BigInt(9000)] } });

    const activeUser = await ctx.usersRepository.create(
      buildUser({
        id: 'admin-active-user-1',
        telegramId: BigInt(9001),
        firstName: 'Active',
        username: 'active_user',
        onboardingCompleted: true,
        consentGiven: true,
      }),
    );
    ctx.adminRepository.getOverview.mockResolvedValue({
      totalUsers: 3,
      consentedUsers: 2,
      onboardedUsers: 2,
      activeUsers: 1,
      totalCheckins: 4,
      totalEvents: 2,
      checkinsLast7Days: 3,
      eventsLast7Days: 1,
      remindersEnabledUsers: 1,
    });
    ctx.adminRepository.listActiveUsers.mockResolvedValue({
      items: [
        {
          user: activeUser,
          entriesCount: 4,
          eventsCount: 2,
          lastEntryDate: new Date('2026-03-12T00:00:00.000Z'),
        },
      ],
      total: 1,
      offset: 0,
      limit: 5,
      hasPrevious: false,
      hasNext: false,
    });

    const router = createRouter();
    const overviewCtx = {
      ...buildBaseContext(9000),
      callbackQuery: { data: TELEGRAM_CALLBACKS.adminOverview },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(overviewCtx);

    expect(overviewCtx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining(telegramCopy.admin.overviewTitle),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    const activeUsersCtx = {
      ...buildBaseContext(9000),
      callbackQuery: { data: `${TELEGRAM_CALLBACKS.adminActiveUsersPrefix}0` },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(activeUsersCtx);

    const [message, extra] = activeUsersCtx.editMessageText.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];
    const callbacks = extra.reply_markup?.inline_keyboard?.flat().map((button) => button.callback_data) ?? [];

    expect(message).toContain('Active');
    expect(message).toContain('check-in: <b>4</b>');
    expect(callbacks).toContain(`${TELEGRAM_CALLBACKS.adminUserPrefix}${activeUser.id}`);
  });

  it('opens feedback items in the admin panel and can mark them reviewed', async () => {
    await ctx.moduleRef.close();
    ctx = await createIntegrationTestContext({ admin: { telegramIds: [BigInt(9004)] } });

    const targetUser = await ctx.usersRepository.create(
      buildUser({
        id: 'admin-feedback-user-1',
        telegramId: BigInt(9005),
        firstName: 'Feedback User',
        onboardingCompleted: true,
        consentGiven: true,
      }),
    );
    const feedbackItem = {
      id: 'feedback-admin-contract-1',
      userId: targetUser.id,
      feedbackType: 'question' as const,
      message: 'Как отметить состояние за вчера?',
      status: 'unread' as const,
      createdAt: new Date('2026-06-05T10:00:00.000Z'),
      updatedAt: new Date('2026-06-05T10:00:00.000Z'),
    };
    const feedbackDetail = {
      item: feedbackItem,
      user: targetUser,
    };
    ctx.adminRepository.listFeedback.mockResolvedValue({
      items: [feedbackDetail],
      total: 1,
      offset: 0,
      limit: 5,
      hasPrevious: false,
      hasNext: false,
    });
    ctx.adminRepository.getFeedbackDetail.mockResolvedValue(feedbackDetail);

    const router = createRouter();
    const listCtx = {
      ...buildBaseContext(9004),
      callbackQuery: { data: `${TELEGRAM_CALLBACKS.adminFeedbackPrefix}0` },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(listCtx);

    expect(listCtx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining(telegramCopy.admin.feedbackTitle),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    const detailCtx = {
      ...buildBaseContext(9004),
      callbackQuery: { data: `${TELEGRAM_CALLBACKS.adminFeedbackOpenPrefix}${feedbackItem.id}:0` },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(detailCtx);

    expect(detailCtx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining(feedbackItem.message),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    const reviewCtx = {
      ...buildBaseContext(9004),
      callbackQuery: { data: `${TELEGRAM_CALLBACKS.adminFeedbackReviewPrefix}${feedbackItem.id}:0` },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(reviewCtx);

    expect(ctx.adminRepository.markFeedbackReviewed).toHaveBeenCalledWith(feedbackItem.id);
  });

  it('starts the admin announcement creation flow and stores the draft campaign id in FSM', async () => {
    await ctx.moduleRef.close();
    ctx = await createIntegrationTestContext({ admin: { telegramIds: [BigInt(9006)] } });

    const announcementsService = {
      createDraft: jest.fn().mockResolvedValue({
        id: 'announcement-draft-1',
        type: AnnouncementType.poll,
      }),
      setTitle: jest.fn().mockResolvedValue({
        id: 'announcement-draft-1',
        type: AnnouncementType.poll,
      }),
    };
    const router = createRouter({ announcementsService });
    const createCtx = {
      ...buildBaseContext(9006),
      callbackQuery: { data: TELEGRAM_CALLBACKS.adminAnnouncementCreate },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(createCtx);

    expect(createCtx.editMessageText).toHaveBeenCalledWith(
      telegramCopy.admin.announcementTypePrompt,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    const adminUser = await ctx.usersRepository.findByTelegramId(BigInt(9006));

    expect(adminUser).not.toBeNull();
    expect(await ctx.fsmService.getState(adminUser!.id)).toBe(FSM_STATES.announcement_type);

    const typeCtx = {
      ...buildBaseContext(9006),
      callbackQuery: { data: `${TELEGRAM_CALLBACKS.adminAnnouncementTypePrefix}poll` },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(typeCtx);

    expect(announcementsService.createDraft).toHaveBeenCalledWith(AnnouncementType.poll, BigInt(9006));
    expect(typeCtx.editMessageText).toHaveBeenCalledWith(
      telegramCopy.admin.announcementTitlePrompt,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect((await ctx.fsmService.getSession(adminUser!.id))?.payloadJson).toMatchObject({
      announcementCampaignId: 'announcement-draft-1',
      announcementType: AnnouncementType.poll,
    });

    const textCtx = {
      ...buildBaseContext(9006),
      message: {
        text: 'Новый опрос',
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleTextMessage(textCtx);

    expect(announcementsService.setTitle).toHaveBeenCalledWith('announcement-draft-1', 'Новый опрос');
    expect(textCtx.reply).toHaveBeenCalledWith(
      telegramCopy.admin.announcementBodyPrompt,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect(await ctx.fsmService.getState(adminUser!.id)).toBe(FSM_STATES.announcement_body);
  });

  it('records announcement poll votes through short user callback data', async () => {
    const user = await createReadyUser('user-router-contract-announcement-vote', 9007);
    const announcementsService = {
      recordPollVote: jest.fn().mockResolvedValue({
        status: 'voted',
        optionLabel: 'Статистика',
      }),
    };
    const router = createRouter({ announcementsService });
    const telegramCtx = {
      ...buildBaseContext(9007),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.announcementVotePrefix}abc123:2`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(announcementsService.recordPollVote).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }),
      'abc123',
      2,
    );
    expect(telegramCtx.answerCbQuery).toHaveBeenCalledWith(telegramCopy.announcements.voteSaved);
    expect(telegramCtx.deleteMessage).toHaveBeenCalled();
  });

  it('lets admin open a target user stats summary without target-user FSM state', async () => {
    await ctx.moduleRef.close();
    ctx = await createIntegrationTestContext({ admin: { telegramIds: [BigInt(9002)] } });

    const targetUser = await ctx.usersRepository.create(
      buildUser({
        id: 'admin-stats-target-1',
        telegramId: BigInt(9003),
        firstName: 'Stats Target',
        onboardingCompleted: true,
        consentGiven: true,
        timezone: 'Europe/Moscow',
      }),
    );
    await ctx.checkinsRepository.upsertByUserAndDate(targetUser.id, new Date('2026-03-12T00:00:00.000Z'), {
      moodScore: 7,
      energyScore: 6,
      stressScore: 3,
    });
    ctx.adminRepository.getUserDetail.mockResolvedValue({
      user: targetUser,
      entriesCount: 1,
      eventsCount: 0,
      summariesCount: 0,
      firstEntryDate: new Date('2026-03-12T00:00:00.000Z'),
      lastEntryDate: new Date('2026-03-12T00:00:00.000Z'),
    });

    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(9002),
      callbackQuery: { data: `${TELEGRAM_CALLBACKS.adminUserStatsPrefix}${targetUser.id}:all` },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      replyWithPhoto: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.editMessageText).toHaveBeenNthCalledWith(
      1,
      telegramCopy.admin.statsLoading,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect((telegramCtx.editMessageText.mock.calls[1] as [string])[0]).toContain('Stats Target');
    expect((telegramCtx.editMessageText.mock.calls[1] as [string])[0]).toContain('Записей: 1');
    expect(await ctx.fsmService.getState(targetUser.id)).toBe(FSM_STATES.idle);
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

    const feedbackCtx = await runMenuCallback(TELEGRAM_CALLBACKS.menuFeedback);
    expect(feedbackCtx.editMessageText).toHaveBeenCalledWith(
      telegramCopy.feedback.typePrompt,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect(await ctx.fsmService.getState('user-router-contract-menu')).toBe(FSM_STATES.feedback_type);

    const supportCtx = await runMenuCallback(TELEGRAM_CALLBACKS.menuSupport);
    expect(supportCtx.editMessageText).toHaveBeenCalledWith(
      telegramCopy.support.missingUrl,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    const helpCtx = await runMenuCallback(TELEGRAM_CALLBACKS.menuHelp);
    expect(helpCtx.editMessageText).toHaveBeenCalledWith(
      telegramCopy.help.text,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    const termsCtx = await runMenuCallback(TELEGRAM_CALLBACKS.menuTerms);
    expect((termsCtx.editMessageText.mock.calls[0] as [string])[0]).toContain(telegramCopy.terms.title);
  });

  it('opens the configured support link without requiring a product flow', async () => {
    const router = createRouter({
      supportService: {
        getSupportUrl: jest.fn().mockReturnValue('https://t.me/emotrack_support'),
      },
    });
    const telegramCtx = {
      ...buildBaseContext(8920),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleSupportCommand(telegramCtx);

    const [message, extra] = telegramCtx.reply.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ text: string; url?: string }>> } },
    ];
    const buttons = extra.reply_markup?.inline_keyboard?.flat() ?? [];

    expect(message).toBe(telegramCopy.support.text);
    expect(buttons).toContainEqual(expect.objectContaining({
      text: telegramCopy.buttons.supportOpen,
      url: 'https://t.me/emotrack_support',
    }));
  });

  it('runs the feedback flow and saves the typed message', async () => {
    const user = await createReadyUser('user-router-contract-feedback', 8921);
    const feedbackService = {
      submit: jest.fn().mockResolvedValue({
        id: 'feedback-router-contract-1',
      }),
    };
    const router = createRouter({ feedbackService });
    const startCtx = {
      ...buildBaseContext(8921),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleFeedbackCommand(startCtx);

    expect(startCtx.reply).toHaveBeenCalledWith(
      telegramCopy.feedback.typePrompt,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.feedback_type);

    const typeCtx = {
      ...buildBaseContext(8921),
      callbackQuery: { data: `${TELEGRAM_CALLBACKS.feedbackTypePrefix}question` },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(typeCtx);

    expect(typeCtx.editMessageText).toHaveBeenCalledWith(
      telegramCopy.feedback.messagePrompt,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.feedback_message);

    const textCtx = {
      ...buildBaseContext(8921),
      message: {
        text: 'Можно ли восстановить запись за вчера?',
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleTextMessage(textCtx);

    expect(feedbackService.submit).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }),
      'question',
      'Можно ли восстановить запись за вчера?',
    );
    expect(textCtx.reply).toHaveBeenCalledWith(
      telegramCopy.feedback.saved,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.idle);
  });

  it('starts a check-in targeted at yesterday from /yesterday', async () => {
    const user = await createReadyUser('user-router-contract-yesterday', 8922);
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8922),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleYesterdayCheckinCommand(telegramCtx);

    const session = await ctx.fsmService.getSession(user.id);

    expect(telegramCtx.reply).toHaveBeenNthCalledWith(
      1,
      telegramCopy.checkin.startedYesterday,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect(session?.state).toBe(FSM_STATES.checkin_metric_score);
    expect(session?.payloadJson).toMatchObject({
      checkinTarget: 'yesterday',
    });
  });

  it('updates the metric tag selection callback screen instead of sending a new message', async () => {
    const user = await createReadyUser('user-router-contract-tags', 8912);
    await ctx.fsmService.setState(user.id, FSM_STATES.checkin_metric_tags, {
      metricKeys: ['mood'],
      activeMetricKey: 'mood',
      metricScores: { mood: 4 },
      metricTags: {},
      selectedTagKeys: [],
    });
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8912),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.checkinMetricTagsTogglePrefix}mood_calm`,
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

    expect(message).toContain('Выбрано: <b>1/3</b>');
    expect(extra.parse_mode).toBe('HTML');
    expect(buttonTexts.some((text) => text.startsWith('✅ '))).toBe(true);
  });

  it('falls back to a normal reply when an inline screen cannot be edited', async () => {
    const user = await createReadyUser('user-router-contract-tags-fallback', 8913);
    await ctx.fsmService.setState(user.id, FSM_STATES.checkin_metric_tags, {
      metricKeys: ['mood'],
      activeMetricKey: 'mood',
      metricScores: { mood: 4 },
      metricTags: {},
      selectedTagKeys: [],
    });
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8913),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.checkinMetricTagsTogglePrefix}mood_calm`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockRejectedValue(new Error('message to edit not found')),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.editMessageText).toHaveBeenCalledTimes(1);
    expect(telegramCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Выбрано: <b>1/3</b>'),
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

  it('guards menu navigation while a check-in flow is active', async () => {
    const user = await createReadyUser('user-router-contract-active-guard', 8917);
    await ctx.fsmService.setState(user.id, FSM_STATES.checkin_metric_score, {
      metricKeys: ['mood'],
      activeMetricKey: 'mood',
      metricScores: {},
      metricTags: {},
    });
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(8917),
      callbackQuery: {
        data: TELEGRAM_CALLBACKS.menuHistory,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.editMessageText).toHaveBeenCalledWith(
      telegramCopy.common.activeFlowGuard,
      expect.objectContaining({ parse_mode: 'HTML' }),
    );

    const [, extra] = telegramCtx.editMessageText.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];
    const callbacks = extra.reply_markup?.inline_keyboard?.flat().map((button) => button.callback_data) ?? [];

    expect(callbacks).toEqual([
      TELEGRAM_CALLBACKS.flowContinue,
      TELEGRAM_CALLBACKS.flowCancelToMenu,
    ]);
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.checkin_metric_score);
    expect(telegramCtx.reply).not.toHaveBeenCalled();
  });

  it('deletes the current check-in callback screen before the final confirmation', async () => {
    const user = await createReadyUser('user-router-contract-checkin-delete', 8915);
    await ctx.fsmService.setState(user.id, FSM_STATES.checkin_note_prompt, {
      entryId: 'entry-router-contract-checkin-delete',
      metricKeys: ['mood'],
      metricScores: { mood: 4 },
      metricTags: {},
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
    const [message, extra] = telegramCtx.reply.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string; text: string }>> } },
    ];
    const buttons = extra.reply_markup?.inline_keyboard?.flat() ?? [];

    expect(message).toContain('Запись за сегодня сохранена');
    expect(buttons).toEqual([
      expect.objectContaining({
        callback_data: TELEGRAM_CALLBACKS.menuHome,
        text: telegramCopy.buttons.toMenu,
      }),
    ]);
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.idle);
  });

  it('shows navigation menu after the first onboarding check-in is saved', async () => {
    const user = await createReadyUser('user-router-contract-first-checkin-menu', 8918);
    await ctx.fsmService.setState(user.id, FSM_STATES.checkin_note_prompt, {
      entryId: 'entry-router-contract-first-checkin-menu',
      metricKeys: ['mood'],
      metricScores: { mood: 5 },
      metricTags: {},
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
      TELEGRAM_CALLBACKS.menuFeedback,
      TELEGRAM_CALLBACKS.menuSupport,
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
        data: `${TELEGRAM_CALLBACKS.settingsDailyMetricTogglePrefix}clarity`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const trackedMetrics = await ctx.usersService.getTrackedMetrics(user.id);
    const clarity = trackedMetrics.find((metric) => metric.key === 'clarity');

    expect(clarity?.enabled).toBe(false);
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.settings_menu);
    expect((await ctx.fsmService.getSession(user.id))?.payloadJson).toMatchObject({
      settingsView: 'daily_metrics',
    });
    expect(telegramCtx.reply).toHaveBeenNthCalledWith(1, telegramCopy.settings.dailyMetricsStale);
    expect((telegramCtx.reply.mock.calls[1] as [string])[0]).toContain(telegramCopy.settings.dailyMetricsTitle);
  });
});
