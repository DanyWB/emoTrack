import { TELEGRAM_CALLBACKS } from '../../src/common/constants/app.constants';
import { TelegramRouter } from '../../src/telegram/telegram.router';
import { telegramCopy } from '../../src/telegram/telegram.copy';
import { buildUser } from '../helpers/in-memory';
import { createIntegrationTestContext, type IntegrationTestContext } from '../helpers/test-context';

describe('History integration', () => {
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

  async function createReadyUser() {
    return ctx.usersRepository.create(
      buildUser({
        id: 'user-history-1',
        telegramId: BigInt(7101),
        onboardingCompleted: true,
        consentGiven: true,
        reminderTime: '21:30',
      }),
    );
  }

  async function seedHistoryEntries(userId: string, count: number): Promise<void> {
    const newestDate = new Date('2026-03-12T00:00:00.000Z');

    for (let index = 0; index < count; index += 1) {
      const entryDate = new Date(newestDate.getTime() - index * 24 * 60 * 60 * 1000);
      await ctx.checkinsRepository.upsertByUserAndDate(userId, entryDate, {
        moodScore: 8 - index,
        energyScore: 7 - index,
        stressScore: 3 + index,
        sleepHours: index === 0 ? 7.5 : undefined,
        sleepQuality: index === 0 ? 4 : undefined,
        noteText: index === 0 ? 'Busy day' : undefined,
      });
    }

    await ctx.eventsService.createEvent(userId, {
      eventType: 'work',
      title: 'Sprint review',
      eventScore: 7,
      eventDate: newestDate.toISOString(),
    });
    await ctx.eventsService.createEvent(userId, {
      eventType: 'family',
      title: 'Dinner',
      eventScore: 8,
      eventDate: newestDate.toISOString(),
    });
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

  async function attachLegacyMetricValue(entryId: string, key: string, value: number): Promise<void> {
    const definition = ctx.dailyMetricsRepository.listDefinitions().find((item) => item.key === key);

    if (!definition) {
      throw new Error(`Missing metric definition ${key}`);
    }

    await ctx.checkinsRepository.upsertMetricValues(entryId, [
      {
        metricDefinitionId: definition.id,
        value,
      },
    ]);
  }

  async function seedOverlapHistory(userId: string): Promise<void> {
    const newestDate = new Date('2026-03-12T00:00:00.000Z');

    for (let index = 0; index < 3; index += 1) {
      const entryDate = new Date(newestDate.getTime() - index * 24 * 60 * 60 * 1000);

      await ctx.checkinsRepository.upsertByUserAndDate(userId, entryDate, {
        moodScore: 6,
        energyScore: 5,
        stressScore: 4,
      });
    }

    await ctx.eventsService.createEvent(userId, {
      eventType: 'travel',
      title: 'Trip',
      eventScore: 7,
      eventDate: new Date('2026-03-11T00:00:00.000Z').toISOString(),
      eventEndDate: new Date('2026-03-12T00:00:00.000Z').toISOString(),
    });
  }

  function buildBaseContext() {
    return {
      from: {
        id: 7101,
        username: 'tester',
        first_name: 'Test',
        language_code: 'ru',
      },
    };
  }

  it('renders the first history page in descending order with open buttons and a more button', async () => {
    const user = await createReadyUser();
    await seedHistoryEntries(user.id, 6);
    const newestEntry = ctx.checkinsRepository.listEntries().at(-1);
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleHistoryCommand(telegramCtx);

    expect(telegramCtx.reply).toHaveBeenCalledTimes(1);
    const [message, markup] = telegramCtx.reply.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];

    expect(message).toContain(telegramCopy.history.title);
    expect(message).toContain('📅 <b>12.03.2026</b>');
    expect(message).toContain('📅 <b>08.03.2026</b>');
    expect(message).not.toContain('📅 <b>07.03.2026</b>');
    expect(message).toContain('📝 заметка · 🗂 2 события');
    expect(markup.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data).toBe(
      `${TELEGRAM_CALLBACKS.historyOpenPrefix}${newestEntry?.id}:root`,
    );
    expect(markup.reply_markup?.inline_keyboard?.[5]?.[0]?.callback_data).toBe(
      `${TELEGRAM_CALLBACKS.historyMorePrefix}2026-03-08`,
    );
    expect(ctx.analyticsRepository.events.map((event) => event.eventName)).toContain('history_requested');
  });

  it('shows v2 optional metrics in the history output for saved entries', async () => {
    const user = await createReadyUser();
    await seedHistoryEntries(user.id, 1);
    const [entry] = ctx.checkinsRepository.listEntries();

    await attachV2MetricValues(entry.id, {
      mood: 4,
      energy: 4,
      calm: 4,
      motivation: 4,
      overall_state: 3,
    });
    await attachLegacyMetricValue(entry.id, 'motivation', 8);

    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleHistoryCommand(telegramCtx);

    const [message] = telegramCtx.reply.mock.calls[0] as [string];

    expect(message).toContain('настроение <b>Хорошее</b>');
    expect(message).toContain('мотивация <b>Хочется</b>');
    expect(message).toContain('общее состояние <b>Нормальное</b>');
    expect(message).not.toContain('🧩 <b>Доп. метрики</b>: Мотивация <b>8</b>');
  });

  it('keeps historical optional metrics visible after the metric is disabled in settings', async () => {
    const user = await createReadyUser();
    await seedHistoryEntries(user.id, 1);
    const [entry] = ctx.checkinsRepository.listEntries();

    await attachV2MetricValues(entry.id, {
      motivation: 4,
    });
    await ctx.usersService.setTrackedMetric(user.id, 'motivation', false);

    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleHistoryCommand(telegramCtx);

    const [message] = telegramCtx.reply.mock.calls[0] as [string];

    expect(message).toContain('мотивация <b>Хочется</b>');
  });

  it('renders an optional-only history entry without the empty legacy core line', async () => {
    const user = await createReadyUser();
    const entry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date('2026-03-12T00:00:00.000Z'), {
      moodScore: null,
      energyScore: null,
      stressScore: null,
      noteText: 'Only extra metrics today',
    });

    await attachV2MetricValues(entry.id, {
      motivation: 4,
      overall_state: 3,
    });

    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleHistoryCommand(telegramCtx);

    const [message] = telegramCtx.reply.mock.calls[0] as [string];
    const lines = message.split('\n');
    const optionalMetricsLine = 'мотивация <b>Хочется</b> · общее состояние <b>Нормальное</b>';

    expect(message).toContain(optionalMetricsLine);
    expect(lines[4]).toBe(optionalMetricsLine);
    expect(message).toContain('📝 заметка · 🗂 0 событий');
  });

  it('opens a history detail view with note, tags, extra metrics, and events', async () => {
    const user = await createReadyUser();
    await seedHistoryEntries(user.id, 1);
    const [entry] = ctx.checkinsRepository.listEntries();

    await attachV2MetricValues(entry.id, {
      mood: 4,
      energy: 4,
      calm: 4,
      motivation: 4,
    });
    await ctx.checkinsRepository.upsertV2MetricValues(entry.id, [
      {
        metricKey: 'mood',
        ordinalValue: 4,
        tagKeys: ['mood_calm'],
      },
    ]);
    await ctx.checkinsRepository.replaceTags(entry.id, ['tag-1', 'tag-2']);

    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.historyOpenPrefix}${entry.id}:root`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.answerCbQuery).toHaveBeenCalled();
    expect(telegramCtx.editMessageText).toHaveBeenCalledTimes(1);
    const [message, markup] = telegramCtx.editMessageText.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];

    expect(message).toContain('Запись за 12.03.2026');
    expect(message).toContain('Состояние');
    expect(message).toContain('настроение <b>Хорошее</b>');
    expect(message).toContain('мотивация <b>Хочется</b>');
    expect(message).toContain('<b>Уточнения</b>\n• Настроение — спокойное');
    expect(message).toContain('<b>😴 Сон</b>\n7.5 ч, качество Хорошо восстановил');
    expect(message).toContain('<b>📝 Заметка</b>\nBusy day');
    expect(message).toContain('Теги');
    expect(message).toContain('Тревога');
    expect(message).toContain('Спокойствие');
    expect(message).toContain('События');
    expect(message).toContain('Sprint review');
    expect(message).toContain('Dinner');
    expect(markup.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data).toBe(
      `${TELEGRAM_CALLBACKS.historyBackPrefix}root`,
    );
  });

  it('renders an optional-only history detail without placeholder sections', async () => {
    const user = await createReadyUser();
    const entry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, new Date('2026-03-12T00:00:00.000Z'), {
      moodScore: null,
      energyScore: null,
      stressScore: null,
      noteText: 'Only extra metrics today',
    });

    await attachV2MetricValues(entry.id, {
      motivation: 4,
      overall_state: 3,
    });

    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.historyOpenPrefix}${entry.id}:root`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const [message] = telegramCtx.editMessageText.mock.calls[0] as [string];

    expect(message).toContain('мотивация <b>Хочется</b> · общее состояние <b>Нормальное</b>');
    expect(message).toContain('<b>📝 Заметка</b>\nOnly extra metrics today');
    expect(message).not.toContain('Настроение / энергия / спокойствие: — / — / —');
    expect(message).not.toContain('Теги\n—');
    expect(message).not.toContain('События\n—');
  });

  it('returns from detail to the same history page', async () => {
    const user = await createReadyUser();
    await seedHistoryEntries(user.id, 6);
    const oldestEntry = ctx.checkinsRepository.listEntries()[0];
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.historyBackPrefix}2026-03-08`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.editMessageText).toHaveBeenCalledTimes(1);
    const [message, markup] = telegramCtx.editMessageText.mock.calls[0] as [
      string,
      { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } },
    ];

    expect(message).toContain(telegramCopy.history.moreTitle);
    expect(message).toContain('📅 <b>07.03.2026</b>');
    expect(message).not.toContain('📅 <b>08.03.2026</b>');
    expect(markup.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data).toBe(
      `${TELEGRAM_CALLBACKS.historyOpenPrefix}${oldestEntry.id}:2026-03-08`,
    );
  });

  it('shows an empty-state message when the user has no history yet', async () => {
    await createReadyUser();
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleHistoryCommand(telegramCtx);

    expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.history.empty, expect.any(Object));
  });

  it('counts a multi-day standalone event on each overlapped history day', async () => {
    const user = await createReadyUser();
    await seedOverlapHistory(user.id);

    const page = await ctx.checkinsService.getRecentEntriesPage(user.id, 5);

    expect(page.entries).toHaveLength(3);
    expect(page.entries[0]).toMatchObject({
      entryDate: new Date('2026-03-12T00:00:00.000Z'),
      eventsCount: 1,
    });
    expect(page.entries[1]).toMatchObject({
      entryDate: new Date('2026-03-11T00:00:00.000Z'),
      eventsCount: 1,
    });
    expect(page.entries[2]).toMatchObject({
      entryDate: new Date('2026-03-10T00:00:00.000Z'),
      eventsCount: 0,
    });
  });

  it('shows overlapped multi-day events in the day detail view', async () => {
    const user = await createReadyUser();
    await seedOverlapHistory(user.id);
    const latestEntry = ctx.checkinsRepository.listEntries()[2];
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.historyOpenPrefix}${latestEntry.id}:root`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    const [message] = telegramCtx.editMessageText.mock.calls[0] as [string];

    expect(message).toContain('События');
    expect(message).toContain('Путешествия: <b>Trip</b> · оценка 7 · 11.03.2026–12.03.2026');
  });

  it('degrades gracefully for a stale more callback', async () => {
    await createReadyUser();
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.historyMorePrefix}2025-01-01`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.history.stale, expect.any(Object));
    expect(telegramCtx.editMessageText).not.toHaveBeenCalled();
  });

  it('degrades gracefully for a stale detail callback', async () => {
    await createReadyUser();
    const router = createRouter();
    const telegramCtx = {
      ...buildBaseContext(),
      callbackQuery: {
        data: `${TELEGRAM_CALLBACKS.historyOpenPrefix}missing-entry:root`,
      },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await (router as any).handleCallbackQuery(telegramCtx);

    expect(telegramCtx.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(telegramCtx.reply).toHaveBeenCalledWith(telegramCopy.history.stale, expect.any(Object));
    expect(telegramCtx.editMessageText).not.toHaveBeenCalled();
  });
});
