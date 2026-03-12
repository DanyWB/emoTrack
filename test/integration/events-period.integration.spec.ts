import { SummaryPeriodType } from '@prisma/client';

import { formatDateKey } from '../../src/common/utils/date.utils';
import { FSM_STATES } from '../../src/fsm/fsm.types';
import { buildUser } from '../helpers/in-memory';
import { createIntegrationTestContext, type IntegrationTestContext } from '../helpers/test-context';

describe('Event period integration', () => {
  let ctx: IntegrationTestContext;

  beforeEach(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterEach(async () => {
    await ctx.moduleRef.close();
  });

  async function createReadyUser() {
    return ctx.usersRepository.create(
      buildUser({
        id: 'user-event-period-1',
        telegramId: BigInt(7201),
        onboardingCompleted: true,
        consentGiven: true,
        reminderTime: '21:30',
      }),
    );
  }

  it('preserves legacy standalone single-day event behavior', async () => {
    const user = await createReadyUser();
    const startDate = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });

    expect(await ctx.eventsFlow.startStandalone(user)).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.event_type,
      source: 'standalone',
    });
    await ctx.eventsFlow.submitType(user, 'work');
    await ctx.eventsFlow.submitTitle(user, 'Focus block');
    await ctx.eventsFlow.submitScore(user, 7);
    await ctx.eventsFlow.skipDescription(user);
    await ctx.eventsFlow.skipEndDate(user);
    const result = await ctx.eventsFlow.submitRepeatMode(user, 'none');

    expect(result).toMatchObject({
      status: 'created',
      source: 'standalone',
    });

    const events = ctx.eventsRepository.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'work',
      title: 'Focus block',
      eventScore: 7,
      eventDate: startDate,
      eventEndDate: null,
      dailyEntryId: null,
    });
  });

  it('creates a standalone multi-day event with a normalized inclusive end date', async () => {
    const user = await createReadyUser();
    const startDate = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);

    await ctx.eventsFlow.startStandalone(user);
    await ctx.eventsFlow.submitType(user, 'travel');
    await ctx.eventsFlow.submitTitle(user, 'Short trip');
    await ctx.eventsFlow.submitScore(user, 8);
    await ctx.eventsFlow.skipDescription(user);
    const result = await ctx.eventsFlow.submitEndDate(user, formatDateKey(endDate));

    expect(result).toMatchObject({
      status: 'created',
      source: 'standalone',
    });

    const events = ctx.eventsRepository.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'travel',
      title: 'Short trip',
      eventScore: 8,
      eventDate: startDate,
      eventEndDate: endDate,
      dailyEntryId: null,
    });
  });

  it('keeps check-in-created events single-day and linked to the current entry', async () => {
    const user = await createReadyUser();
    const entryDate = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const entry = await ctx.checkinsRepository.upsertByUserAndDate(user.id, entryDate, {
      moodScore: 7,
      energyScore: 6,
      stressScore: 4,
    });

    await ctx.fsmService.setState(user.id, FSM_STATES.checkin_add_event_confirm, {
      entryId: entry.id,
      entryDateKey: formatDateKey(entryDate),
      moodScore: 7,
      energyScore: 6,
      stressScore: 4,
      isUpdate: false,
    });

    await ctx.eventsFlow.startFromCheckin(user);
    await ctx.eventsFlow.submitType(user, 'family');
    await ctx.eventsFlow.submitTitle(user, 'Dinner');
    await ctx.eventsFlow.submitScore(user, 8);
    const result = await ctx.eventsFlow.skipDescription(user);

    expect(result).toMatchObject({
      status: 'created',
      source: 'checkin',
    });

    const events = ctx.eventsRepository.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'family',
      title: 'Dinner',
      eventScore: 8,
      eventDate: entryDate,
      eventEndDate: null,
      seriesId: null,
      seriesPosition: null,
      dailyEntryId: entry.id,
    });
  });

  it('creates a bounded daily repeated standalone series and treats the count as total occurrences', async () => {
    const user = await createReadyUser();
    const startDate = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });

    await ctx.eventsFlow.startStandalone(user);
    await ctx.eventsFlow.submitType(user, 'work');
    await ctx.eventsFlow.submitTitle(user, 'Gym block');
    await ctx.eventsFlow.submitScore(user, 7);
    await ctx.eventsFlow.skipDescription(user);
    await ctx.eventsFlow.skipEndDate(user);
    await ctx.eventsFlow.submitRepeatMode(user, 'daily');
    const result = await ctx.eventsFlow.submitRepeatCount(user, 3);

    expect(result).toMatchObject({
      status: 'created',
      source: 'standalone',
      createdEventsCount: 3,
    });

    const events = ctx.eventsRepository.listEvents();
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.eventDate)).toEqual([
      startDate,
      new Date(startDate.getTime() + 24 * 60 * 60 * 1000),
      new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000),
    ]);
    expect(events.every((event) => event.eventEndDate === null)).toBe(true);
    expect(events[0].seriesId).toBeTruthy();
    expect(events.map((event) => event.seriesPosition)).toEqual([1, 2, 3]);
    expect(new Set(events.map((event) => event.seriesId)).size).toBe(1);
  });

  it('creates a bounded weekly repeated standalone series', async () => {
    const user = await createReadyUser();
    const startDate = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });

    await ctx.eventsFlow.startStandalone(user);
    await ctx.eventsFlow.submitType(user, 'rest');
    await ctx.eventsFlow.submitTitle(user, 'Therapy walk');
    await ctx.eventsFlow.submitScore(user, 8);
    await ctx.eventsFlow.skipDescription(user);
    await ctx.eventsFlow.skipEndDate(user);
    await ctx.eventsFlow.submitRepeatMode(user, 'weekly');
    const result = await ctx.eventsFlow.submitRepeatCount(user, 2);

    expect(result).toMatchObject({
      status: 'created',
      source: 'standalone',
      createdEventsCount: 2,
    });

    const events = ctx.eventsRepository.listEvents();
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.eventDate)).toEqual([
      startDate,
      new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000),
    ]);
  });

  it('treats a repeated series retry with the same seriesId as already committed', async () => {
    const user = await createReadyUser();
    const startDate = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const seriesId = 'series-fixed-1';

    const first = await ctx.eventsService.createRepeatedStandaloneEvents(
      user.id,
      {
        eventType: 'study',
        title: 'Language class',
        eventScore: 8,
        eventDate: startDate.toISOString(),
      },
      'weekly',
      3,
      seriesId,
    );
    const second = await ctx.eventsService.createRepeatedStandaloneEvents(
      user.id,
      {
        eventType: 'study',
        title: 'Language class',
        eventScore: 8,
        eventDate: startDate.toISOString(),
      },
      'weekly',
      3,
      seriesId,
    );

    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(second.map((event) => event.id)).toEqual(first.map((event) => event.id));
    expect(ctx.eventsRepository.listEvents()).toHaveLength(3);
  });

  it('treats repeated rows as ordinary events in history day counts', async () => {
    const user = await createReadyUser();
    const startDate = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const nextDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

    await ctx.checkinsRepository.upsertByUserAndDate(user.id, startDate, {
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, nextDate, {
      moodScore: 7,
      energyScore: 6,
      stressScore: 4,
    });

    await ctx.eventsService.createRepeatedStandaloneEvents(
      user.id,
      {
        eventType: 'study',
        title: 'Course',
        eventScore: 7,
        eventDate: startDate.toISOString(),
      },
      'daily',
      2,
      'series-fixed-2',
    );

    const page = await ctx.checkinsService.getRecentEntriesPage(user.id, 5);

    expect(page.entries).toHaveLength(2);
    expect(page.entries[0].eventsCount).toBe(1);
    expect(page.entries[1].eventsCount).toBe(1);
  });

  it('includes overlapping multi-day events in stats period reads', async () => {
    const user = await createReadyUser();
    const today = ctx.checkinsService.buildEntryDate({
      date: new Date(),
      timezone: user.timezone,
    });
    const periodStart = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const midPeriod = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);

    await ctx.checkinsRepository.upsertByUserAndDate(user.id, periodStart, {
      moodScore: 5,
      energyScore: 5,
      stressScore: 5,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, midPeriod, {
      moodScore: 6,
      energyScore: 6,
      stressScore: 4,
    });
    await ctx.checkinsRepository.upsertByUserAndDate(user.id, today, {
      moodScore: 7,
      energyScore: 6,
      stressScore: 3,
    });

    await ctx.eventsService.createEvent(user.id, {
      eventType: 'travel',
      title: 'Long trip',
      eventScore: 8,
      eventDate: new Date(periodStart.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      eventEndDate: periodStart.toISOString(),
    });
    await ctx.eventsService.createEvent(user.id, {
      eventType: 'other',
      title: 'Old task',
      eventScore: 3,
      eventDate: new Date(periodStart.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString(),
      eventEndDate: new Date(periodStart.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const payload = await ctx.statsService.buildPeriodStats(user.id, SummaryPeriodType.d7, {
      timezone: user.timezone,
    });

    expect(payload.eventsCount).toBe(1);
    expect(payload.eventBreakdown).toMatchObject({
      travel: 1,
    });
    expect(
      payload.chartPoints.find((point) => point.date === formatDateKey(periodStart))?.hasEvent,
    ).toBe(true);
    expect(
      payload.chartPoints.find((point) => point.date === formatDateKey(midPeriod))?.hasEvent,
    ).toBe(false);
  });
});
