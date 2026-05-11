import { CheckinsService } from '../../src/checkins/checkins.service';
import { DailyMetricsService } from '../../src/daily-metrics/daily-metrics.service';
import { EventsService } from '../../src/events/events.service';
import { TagsService } from '../../src/tags/tags.service';
import {
  InMemoryCheckinsRepository,
  InMemoryDailyMetricsRepository,
  InMemoryEventsRepository,
  InMemoryTagsRepository,
  createConfigService,
} from '../helpers/in-memory';

describe('CheckinsService', () => {
  function createService(): {
    service: CheckinsService;
    repository: InMemoryCheckinsRepository;
    dailyMetricsRepository: InMemoryDailyMetricsRepository;
  } {
    const repository = new InMemoryCheckinsRepository();
    const eventsService = new EventsService(new InMemoryEventsRepository() as never, createConfigService());
    const tagsService = new TagsService(new InMemoryTagsRepository() as never);
    const dailyMetricsRepository = new InMemoryDailyMetricsRepository();
    const dailyMetricsService = new DailyMetricsService(dailyMetricsRepository as never);
    const service = new CheckinsService(
      repository as never,
      eventsService,
      tagsService,
      dailyMetricsService,
      createConfigService({
        app: {
          defaultTimezone: 'Europe/Berlin',
        },
      }),
    );

    return { service, repository, dailyMetricsRepository };
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

  it('aggregates extra metric averages for a period without loading per-entry metric views', async () => {
    const { service, repository, dailyMetricsRepository } = createService();

    const first = await repository.upsertByUserAndDate('user-1', new Date('2026-03-09T00:00:00.000Z'), {
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
    });
    const second = await repository.upsertByUserAndDate('user-1', new Date('2026-03-10T00:00:00.000Z'), {
      moodScore: 7,
      energyScore: 6,
      stressScore: 3,
    });

    const definitionsByKey = new Map(
      dailyMetricsRepository.listDefinitions().map((definition) => [definition.key, definition.id] as const),
    );

    await repository.upsertMetricValues(first.id, [
      {
        metricDefinitionId: definitionsByKey.get('joy')!,
        value: 7,
      },
      {
        metricDefinitionId: definitionsByKey.get('wellbeing')!,
        value: 6,
      },
      {
        metricDefinitionId: definitionsByKey.get('mood')!,
        value: 6,
      },
    ]);
    await repository.upsertMetricValues(second.id, [
      {
        metricDefinitionId: definitionsByKey.get('joy')!,
        value: 9,
      },
      {
        metricDefinitionId: definitionsByKey.get('wellbeing')!,
        value: 8,
      },
      {
        metricDefinitionId: definitionsByKey.get('stress')!,
        value: 3,
      },
    ]);

    const averages = await service.getExtraMetricAveragesForPeriod(
      'user-1',
      new Date('2026-03-09T00:00:00.000Z'),
      new Date('2026-03-10T00:00:00.000Z'),
    );

    expect(averages).toEqual([
      {
        key: 'joy',
        label: 'Радость',
        average: 8,
        observationsCount: 2,
      },
      {
        key: 'wellbeing',
        label: 'Самочувствие',
        average: 7,
        observationsCount: 2,
      },
    ]);
  });
});
