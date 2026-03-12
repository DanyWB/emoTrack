import { CheckinsService } from '../../src/checkins/checkins.service';
import { EventsService } from '../../src/events/events.service';
import { TagsService } from '../../src/tags/tags.service';
import {
  InMemoryCheckinsRepository,
  InMemoryEventsRepository,
  InMemoryTagsRepository,
  createConfigService,
} from '../helpers/in-memory';

describe('CheckinsService', () => {
  function createService(): { service: CheckinsService; repository: InMemoryCheckinsRepository } {
    const repository = new InMemoryCheckinsRepository();
    const eventsService = new EventsService(new InMemoryEventsRepository() as never, createConfigService());
    const tagsService = new TagsService(new InMemoryTagsRepository() as never);
    const service = new CheckinsService(
      repository as never,
      eventsService,
      tagsService,
      createConfigService({
        app: {
          defaultTimezone: 'Europe/Berlin',
        },
      }),
    );

    return { service, repository };
  }

  it('creates a daily entry when none exists for the day', async () => {
    const { service, repository } = createService();

    const result = await service.upsertTodayEntry(
      'user-1',
      {
        moodScore: 6,
        energyScore: 5,
        stressScore: 4,
        sleepHours: 7.5,
        sleepQuality: 8,
      },
      {
        date: new Date('2026-03-11T10:15:00.000Z'),
        timezone: 'Europe/Berlin',
      },
    );

    expect(result.isUpdate).toBe(false);
    expect(repository.listEntries()).toHaveLength(1);
    expect(repository.listEntries()[0]).toMatchObject({
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
      sleepQuality: 8,
    });
  });

  it('updates the same entry on a repeated same-day check-in', async () => {
    const { service, repository } = createService();

    const first = await service.upsertTodayEntry(
      'user-1',
      {
        moodScore: 5,
        energyScore: 4,
        stressScore: 6,
        sleepHours: 7,
        sleepQuality: 6,
      },
      {
        date: new Date('2026-03-11T08:00:00.000Z'),
        timezone: 'Europe/Berlin',
      },
    );
    const second = await service.upsertTodayEntry(
      'user-1',
      {
        moodScore: 8,
        energyScore: 7,
        stressScore: 3,
        sleepHours: 8,
        sleepQuality: 8,
      },
      {
        date: new Date('2026-03-11T19:30:00.000Z'),
        timezone: 'Europe/Berlin',
      },
    );

    expect(first.entry.id).toBe(second.entry.id);
    expect(second.isUpdate).toBe(true);
    expect(repository.listEntries()).toHaveLength(1);
    expect(repository.listEntries()[0]).toMatchObject({
      id: first.entry.id,
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
      sleepQuality: 8,
    });
  });
});
