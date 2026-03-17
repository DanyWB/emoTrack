import { DailyMetricsService } from '../../src/daily-metrics/daily-metrics.service';
import {
  InMemoryDailyMetricsRepository,
  buildUser,
} from '../helpers/in-memory';

describe('DailyMetricsService', () => {
  it('creates default tracked metrics for a user and mirrors legacy core flags', async () => {
    const repository = new InMemoryDailyMetricsRepository();
    const service = new DailyMetricsService(repository as never);
    const user = buildUser({
      id: 'user-metrics-1',
      trackMood: true,
      trackEnergy: false,
      trackStress: true,
      trackSleep: false,
    });

    await service.ensureUserTrackedMetrics(user);

    const trackedMetrics = repository.listUserTrackedMetrics(user.id);
    const byKey = new Map(trackedMetrics.map((metric) => [metric.metricDefinition.key, metric] as const));

    expect(trackedMetrics).toHaveLength(11);
    expect(byKey.get('mood')?.isEnabled).toBe(true);
    expect(byKey.get('energy')?.isEnabled).toBe(false);
    expect(byKey.get('stress')?.isEnabled).toBe(true);
    expect(byKey.get('sleep')?.isEnabled).toBe(false);
    expect(byKey.get('joy')?.isEnabled).toBe(false);
    expect(byKey.get('wellbeing')?.isEnabled).toBe(false);
  });

  it('preserves existing extra metric choices while re-syncing legacy core flags', async () => {
    const repository = new InMemoryDailyMetricsRepository();
    const service = new DailyMetricsService(repository as never);
    const initialUser = buildUser({
      id: 'user-metrics-2',
      trackMood: true,
      trackEnergy: true,
      trackStress: true,
      trackSleep: true,
    });

    await service.ensureUserTrackedMetrics(initialUser);

    const joyDefinition = repository.listDefinitions().find((definition) => definition.key === 'joy');

    if (!joyDefinition) {
      throw new Error('joy definition missing');
    }

    await repository.upsertUserTrackedMetrics(initialUser.id, [
      {
        metricDefinitionId: joyDefinition.id,
        isEnabled: true,
        sortOrder: joyDefinition.sortOrder,
      },
    ]);

    await service.ensureUserTrackedMetrics(
      buildUser({
        id: initialUser.id,
        trackMood: false,
        trackEnergy: true,
        trackStress: false,
        trackSleep: true,
      }),
    );

    const trackedMetrics = repository.listUserTrackedMetrics(initialUser.id);
    const byKey = new Map(trackedMetrics.map((metric) => [metric.metricDefinition.key, metric] as const));

    expect(byKey.get('mood')?.isEnabled).toBe(false);
    expect(byKey.get('energy')?.isEnabled).toBe(true);
    expect(byKey.get('stress')?.isEnabled).toBe(false);
    expect(byKey.get('sleep')?.isEnabled).toBe(true);
    expect(byKey.get('joy')?.isEnabled).toBe(true);
  });
});
