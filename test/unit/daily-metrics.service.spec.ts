import { DailyMetricsService } from '../../src/daily-metrics/daily-metrics.service';
import {
  InMemoryDailyMetricsRepository,
  buildUser,
} from '../helpers/in-memory';

describe('DailyMetricsService', () => {
  it('creates default product preferences with immutable core metrics and a separate sleep block', async () => {
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
    const preferences = await repository.findUserMetricPreferences(user.id);
    const preferencesByKey = new Map(preferences.map((preference) => [preference.metricKey, preference] as const));

    expect(trackedMetrics).toHaveLength(9);
    expect(byKey.get('mood')?.isEnabled).toBe(true);
    expect(byKey.get('energy')?.isEnabled).toBe(true);
    expect(byKey.get('calm')?.isEnabled).toBe(true);
    expect(byKey.get('sleep')?.isEnabled).toBe(false);
    expect(preferencesByKey.get('mood')?.enabled).toBe(true);
    expect(preferencesByKey.get('energy')?.enabled).toBe(true);
    expect(preferencesByKey.get('calm')?.enabled).toBe(true);
    expect(preferencesByKey.get('motivation')?.enabled).toBe(true);
    expect(preferencesByKey.get('overall_state')?.enabled).toBe(true);
    expect(preferencesByKey.get('clarity')?.enabled).toBe(false);
    expect(preferencesByKey.get('social')?.enabled).toBe(false);
    expect(preferencesByKey.get('physical_state')?.enabled).toBe(false);
  });

  it('preserves existing optional metric choices while re-syncing immutable core preferences', async () => {
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
    await repository.upsertUserMetricPreferences(initialUser.id, [
      {
        metricKey: 'clarity',
        enabled: true,
        sortOrder: 60,
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
    const preferences = await repository.findUserMetricPreferences(initialUser.id);
    const preferencesByKey = new Map(preferences.map((preference) => [preference.metricKey, preference] as const));

    expect(byKey.get('mood')?.isEnabled).toBe(true);
    expect(byKey.get('energy')?.isEnabled).toBe(true);
    expect(byKey.get('calm')?.isEnabled).toBe(true);
    expect(byKey.get('sleep')?.isEnabled).toBe(true);
    expect(preferencesByKey.get('mood')?.enabled).toBe(true);
    expect(preferencesByKey.get('energy')?.enabled).toBe(true);
    expect(preferencesByKey.get('calm')?.enabled).toBe(true);
    expect(preferencesByKey.get('clarity')?.enabled).toBe(true);
  });
});
