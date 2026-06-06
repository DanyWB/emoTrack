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

    return { service, repository };
  }

  function listV2MetricValuesByKey(repository: InMemoryCheckinsRepository, entryId: string) {
    return Object.fromEntries(
      repository
        .listV2MetricValuesForEntry(entryId)
        .map((metricValue) => [
          metricValue.metricKey,
          {
            ordinalValue: metricValue.ordinalValue,
            tagKeys: metricValue.tags.map((tag) => tag.tagKey),
          },
        ]),
    );
  }

  it('creates a daily entry with v2 metric values when none exists for the day', async () => {
    const { service, repository } = createService();

    const result = await service.upsertTodayEntry(
      'user-1',
      {
        v2MetricValues: [
          { key: 'mood', ordinalValue: 4, tagKeys: ['mood_calm'] },
          { key: 'energy', ordinalValue: 3, tagKeys: ['energy_even'] },
          { key: 'calm', ordinalValue: 2, tagKeys: ['calm_tense'] },
        ],
        sleepHours: 7.5,
        sleepQuality: 4,
      },
      {
        date: new Date('2026-03-11T10:15:00.000Z'),
        timezone: 'Europe/Berlin',
      },
    );

    expect(result.isUpdate).toBe(false);
    expect(repository.listEntries()).toHaveLength(1);
    expect(repository.listEntries()[0]).toMatchObject({
      moodScore: null,
      energyScore: null,
      stressScore: null,
      sleepQuality: 4,
    });
    expect(listV2MetricValuesByKey(repository, result.entry.id)).toMatchObject({
      mood: { ordinalValue: 4, tagKeys: ['mood_calm'] },
      energy: { ordinalValue: 3, tagKeys: ['energy_even'] },
      calm: { ordinalValue: 2, tagKeys: ['calm_tense'] },
    });
  });

  it('updates the same entry and replaces v2 metric tags on a repeated same-day check-in', async () => {
    const { service, repository } = createService();

    const first = await service.upsertTodayEntry(
      'user-1',
      {
        v2MetricValues: [
          { key: 'mood', ordinalValue: 3, tagKeys: ['mood_unclear'] },
          { key: 'energy', ordinalValue: 2 },
          { key: 'calm', ordinalValue: 3 },
        ],
        sleepHours: 7,
        sleepQuality: 3,
      },
      {
        date: new Date('2026-03-11T08:00:00.000Z'),
        timezone: 'Europe/Berlin',
      },
    );
    const second = await service.upsertTodayEntry(
      'user-1',
      {
        v2MetricValues: [
          { key: 'mood', ordinalValue: 5, tagKeys: ['mood_joyful', 'mood_inspired'] },
          { key: 'energy', ordinalValue: 4 },
          { key: 'calm', ordinalValue: 4 },
        ],
        sleepHours: 8,
        sleepQuality: 4,
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
      sleepQuality: 4,
    });
    expect(listV2MetricValuesByKey(repository, second.entry.id)).toMatchObject({
      mood: { ordinalValue: 5, tagKeys: ['mood_joyful', 'mood_inspired'] },
      energy: { ordinalValue: 4, tagKeys: [] },
      calm: { ordinalValue: 4, tagKeys: [] },
    });
  });

  it('builds and counts a yesterday entry date in the user timezone', async () => {
    const { service, repository } = createService();
    const now = new Date('2026-06-05T12:30:00.000Z');
    const entryDate = service.buildRelativeEntryDate(-1, {
      date: now,
      timezone: 'Europe/Moscow',
    });

    expect(entryDate.toISOString()).toBe('2026-06-04T00:00:00.000Z');

    await service.upsertEntryForDate(
      'user-1',
      {
        v2MetricValues: [
          { key: 'mood', ordinalValue: 4 },
          { key: 'energy', ordinalValue: 3 },
          { key: 'calm', ordinalValue: 4 },
        ],
      },
      entryDate,
    );

    await expect(service.countYesterdayEntry('user-1', {
      date: now,
      timezone: 'Europe/Moscow',
    })).resolves.toBe(1);
    expect(repository.listEntries()).toHaveLength(1);
  });

  it('attaches v2 optional metric values for period reads', async () => {
    const { service, repository } = createService();

    const first = await repository.upsertByUserAndDate('user-1', new Date('2026-03-09T00:00:00.000Z'), {
      moodScore: null,
      energyScore: null,
      stressScore: null,
    });
    const second = await repository.upsertByUserAndDate('user-1', new Date('2026-03-10T00:00:00.000Z'), {
      moodScore: null,
      energyScore: null,
      stressScore: null,
    });

    await repository.upsertV2MetricValues(first.id, [
      { metricKey: 'mood', ordinalValue: 4 },
      { metricKey: 'motivation', ordinalValue: 3, tagKeys: ['motivation_neutral'] },
      { metricKey: 'overall_state', ordinalValue: 2, tagKeys: ['overall_heavy'] },
    ]);
    await repository.upsertV2MetricValues(second.id, [
      { metricKey: 'mood', ordinalValue: 5 },
      { metricKey: 'motivation', ordinalValue: 4, tagKeys: ['motivation_interesting'] },
      { metricKey: 'overall_state', ordinalValue: 3 },
    ]);

    const entries = await service.getEntriesForPeriodWithV2Metrics(
      'user-1',
      new Date('2026-03-09T00:00:00.000Z'),
      new Date('2026-03-10T00:00:00.000Z'),
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]?.checkinMetrics.map((metric) => metric.key)).toEqual(['mood', 'motivation', 'overall_state']);
    expect(entries[0]?.checkinMetrics.find((metric) => metric.key === 'motivation')).toMatchObject({
      label: 'Мотивация',
      ordinalValue: 3,
      tags: [{ key: 'motivation_neutral', label: 'нейтрально' }],
    });
    expect(entries[1]?.checkinMetrics.find((metric) => metric.key === 'overall_state')).toMatchObject({
      label: 'Общее состояние',
      ordinalValue: 3,
      tags: [],
    });
  });
});
