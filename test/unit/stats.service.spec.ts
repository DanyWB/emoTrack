import { SummaryPeriodType } from '@prisma/client';

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
});
