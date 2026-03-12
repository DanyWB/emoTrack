import { Prisma, SummaryPeriodType } from '@prisma/client';

import { StatsService } from '../../src/stats/stats.service';
import { buildDailyEntry, buildEvent } from '../helpers/in-memory';

describe('StatsService', () => {
  it('calculates averages across entry values', () => {
    const service = new StatsService({} as never, {} as never);
    const averages = service.calculateAverages([
      buildDailyEntry({
        moodScore: 8,
        energyScore: 6,
        stressScore: 3,
      }),
      buildDailyEntry({
        moodScore: 6,
        energyScore: 8,
        stressScore: 5,
      }),
    ]);

    expect(averages).toEqual({
      mood: 7,
      energy: 7,
      stress: 4,
      sleepHours: 7.5,
      sleepQuality: 7,
    });
  });

  it('finds best and worst day deterministically', () => {
    const service = new StatsService({} as never, {} as never);
    const entries = [
      buildDailyEntry({
        entryDate: new Date('2026-03-09T00:00:00.000Z'),
        moodScore: 4,
        energyScore: 6,
        stressScore: 8,
      }),
      buildDailyEntry({
        entryDate: new Date('2026-03-10T00:00:00.000Z'),
        moodScore: 9,
        energyScore: 7,
        stressScore: 2,
      }),
      buildDailyEntry({
        entryDate: new Date('2026-03-11T00:00:00.000Z'),
        moodScore: 9,
        energyScore: 8,
        stressScore: 4,
      }),
    ];

    expect(service.findBestDay(entries)).toEqual({
      date: '2026-03-11',
      moodScore: 9,
      energyScore: 8,
      stressScore: 4,
    });

    expect(service.findWorstDay(entries)).toEqual({
      date: '2026-03-09',
      moodScore: 4,
      energyScore: 6,
      stressScore: 8,
    });
  });

  it('builds event type breakdown', () => {
    const service = new StatsService({} as never, {} as never);
    const breakdown = service.buildEventBreakdown([
      buildEvent({ eventType: 'work' }),
      buildEvent({ eventType: 'work', id: 'event-2' }),
      buildEvent({ eventType: 'rest', id: 'event-3' }),
    ]);

    expect(breakdown).toEqual({
      work: 2,
      rest: 1,
    });
  });

  it('calculates delta versus previous period when both ranges have data', async () => {
    const checkinsService = {
      buildEntryDate: jest.fn().mockReturnValue(new Date('2026-03-11T00:00:00.000Z')),
      getEntriesForPeriod: jest
        .fn()
        .mockResolvedValueOnce([
          buildDailyEntry({
            moodScore: 5,
            energyScore: 4,
            stressScore: 7,
            sleepHours: null,
            sleepQuality: 5,
          }),
        ])
        .mockResolvedValueOnce([
          buildDailyEntry({
            moodScore: 8,
            energyScore: 6,
            stressScore: 3,
            sleepHours: null,
            sleepQuality: 7,
          }),
        ]),
    };
    const service = new StatsService(checkinsService as never, {} as never);

    const delta = await service.calculateDeltaVsPrevious(
      'user-1',
      SummaryPeriodType.d7,
      new Date('2026-02-26T00:00:00.000Z'),
      new Date('2026-03-04T00:00:00.000Z'),
    );

    expect(delta).toEqual({
      mood: 3,
      energy: 2,
      stress: -4,
      sleepHours: null,
      sleepQuality: 2,
    });
  });

  it('detects one clear sleep-state pattern and omits weaker competitors', () => {
    const service = new StatsService({} as never, {} as never);
    const entries = [
      buildDailyEntry({ entryDate: new Date('2026-03-01T00:00:00.000Z'), sleepHours: new Prisma.Decimal(5), sleepQuality: null, moodScore: 4, energyScore: 3, stressScore: 5 }),
      buildDailyEntry({ entryDate: new Date('2026-03-02T00:00:00.000Z'), sleepHours: new Prisma.Decimal(5), sleepQuality: null, moodScore: 4, energyScore: 3, stressScore: 5 }),
      buildDailyEntry({ entryDate: new Date('2026-03-03T00:00:00.000Z'), sleepHours: new Prisma.Decimal(5), sleepQuality: null, moodScore: 4, energyScore: 3, stressScore: 5 }),
      buildDailyEntry({ entryDate: new Date('2026-03-04T00:00:00.000Z'), sleepHours: new Prisma.Decimal(8), sleepQuality: null, moodScore: 5, energyScore: 6, stressScore: 4 }),
      buildDailyEntry({ entryDate: new Date('2026-03-05T00:00:00.000Z'), sleepHours: new Prisma.Decimal(8), sleepQuality: null, moodScore: 5, energyScore: 6, stressScore: 4 }),
      buildDailyEntry({ entryDate: new Date('2026-03-06T00:00:00.000Z'), sleepHours: new Prisma.Decimal(8), sleepQuality: null, moodScore: 5, energyScore: 6, stressScore: 4 }),
    ];

    expect(service.findSleepStatePattern(entries)).toEqual({
      kind: 'sleep_hours_energy',
      delta: 3,
    });
  });

  it('builds a weekday mood pattern only when one best and one worst weekday are clearly separated', () => {
    const service = new StatsService({} as never, {} as never);
    const entries = [
      buildDailyEntry({ entryDate: new Date('2026-03-02T00:00:00.000Z'), moodScore: 4 }),
      buildDailyEntry({ entryDate: new Date('2026-03-03T00:00:00.000Z'), moodScore: 8 }),
      buildDailyEntry({ entryDate: new Date('2026-03-04T00:00:00.000Z'), moodScore: 6 }),
      buildDailyEntry({ entryDate: new Date('2026-03-05T00:00:00.000Z'), moodScore: 6 }),
      buildDailyEntry({ entryDate: new Date('2026-03-06T00:00:00.000Z'), moodScore: 6 }),
      buildDailyEntry({ entryDate: new Date('2026-03-07T00:00:00.000Z'), moodScore: 6 }),
      buildDailyEntry({ entryDate: new Date('2026-03-08T00:00:00.000Z'), moodScore: 6 }),
      buildDailyEntry({ entryDate: new Date('2026-03-09T00:00:00.000Z'), moodScore: 4 }),
      buildDailyEntry({ entryDate: new Date('2026-03-10T00:00:00.000Z'), moodScore: 8 }),
      buildDailyEntry({ entryDate: new Date('2026-03-11T00:00:00.000Z'), moodScore: 6 }),
      buildDailyEntry({ entryDate: new Date('2026-03-12T00:00:00.000Z'), moodScore: 6 }),
      buildDailyEntry({ entryDate: new Date('2026-03-13T00:00:00.000Z'), moodScore: 6 }),
      buildDailyEntry({ entryDate: new Date('2026-03-14T00:00:00.000Z'), moodScore: 6 }),
      buildDailyEntry({ entryDate: new Date('2026-03-15T00:00:00.000Z'), moodScore: 6 }),
    ];

    expect(service.findWeekdayMoodPattern(entries)).toEqual({
      bestWeekday: 2,
      bestMood: 8,
      worstWeekday: 1,
      worstMood: 4,
    });
  });

  it('builds a minimal event companion block only for a clear leader and a strong day-level difference', () => {
    const service = new StatsService({} as never, {} as never);
    const entries = [
      buildDailyEntry({ entryDate: new Date('2026-03-01T00:00:00.000Z'), moodScore: 8 }),
      buildDailyEntry({ entryDate: new Date('2026-03-02T00:00:00.000Z'), moodScore: 8 }),
      buildDailyEntry({ entryDate: new Date('2026-03-03T00:00:00.000Z'), moodScore: 8 }),
      buildDailyEntry({ entryDate: new Date('2026-03-04T00:00:00.000Z'), moodScore: 5 }),
      buildDailyEntry({ entryDate: new Date('2026-03-05T00:00:00.000Z'), moodScore: 5 }),
      buildDailyEntry({ entryDate: new Date('2026-03-06T00:00:00.000Z'), moodScore: 5 }),
    ];
    const events = [
      buildEvent({ id: 'event-1', eventDate: new Date('2026-03-01T00:00:00.000Z'), eventType: 'work' }),
      buildEvent({ id: 'event-2', eventDate: new Date('2026-03-02T00:00:00.000Z'), eventType: 'work' }),
      buildEvent({ id: 'event-3', eventDate: new Date('2026-03-03T00:00:00.000Z'), eventType: 'work' }),
    ];

    expect(service.buildEventCompanion(entries, events)).toEqual({
      topEventType: 'work',
      topEventCount: 3,
      moodDeltaOnEventDays: 3,
    });
  });

  it('adds lightweight chart annotations from existing stats payload semantics', async () => {
    const missingSleepEntry = buildDailyEntry({
      entryDate: new Date('2026-03-09T00:00:00.000Z'),
      moodScore: 4,
      energyScore: 5,
      stressScore: 7,
    });
    missingSleepEntry.sleepHours = null;
    missingSleepEntry.sleepQuality = null;

    const entries = [
      missingSleepEntry,
      buildDailyEntry({
        entryDate: new Date('2026-03-10T00:00:00.000Z'),
        moodScore: 8,
        energyScore: 7,
        stressScore: 3,
      }),
      buildDailyEntry({
        entryDate: new Date('2026-03-11T00:00:00.000Z'),
        moodScore: 6,
        energyScore: 6,
        stressScore: 4,
      }),
    ];
    const events = [
      buildEvent({
        id: 'event-visual-1',
        eventDate: new Date('2026-03-10T00:00:00.000Z'),
        eventType: 'work',
      }),
    ];
    const checkinsService = {
      buildEntryDate: jest.fn().mockReturnValue(new Date('2026-03-11T00:00:00.000Z')),
      getEntriesForPeriod: jest.fn().mockResolvedValue(entries),
    };
    const eventsService = {
      getEventsForPeriod: jest.fn().mockResolvedValue(events),
    };
    const service = new StatsService(checkinsService as never, eventsService as never);

    const payload = await service.buildPeriodStats('user-1', SummaryPeriodType.d7);

    expect(payload.chartPoints).toEqual([
      expect.objectContaining({
        date: '2026-03-09',
        hasEvent: false,
        isBestDay: false,
        isWorstDay: true,
        isSleepMissing: true,
      }),
      expect.objectContaining({
        date: '2026-03-10',
        hasEvent: true,
        isBestDay: true,
        isWorstDay: false,
        isSleepMissing: false,
      }),
      expect.objectContaining({
        date: '2026-03-11',
        hasEvent: false,
        isBestDay: false,
        isWorstDay: false,
        isSleepMissing: false,
      }),
    ]);
  });
});
