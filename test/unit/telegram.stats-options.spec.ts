import type { EnabledCheckinMetric } from '../../src/daily-metrics/daily-metrics.service';
import {
  buildStatsMetricOptions,
  isAvailableStatsMetricKey,
} from '../../src/telegram/telegram.stats-options';

function metric(overrides: Partial<EnabledCheckinMetric>): EnabledCheckinMetric {
  return {
    key: overrides.key ?? 'mood',
    label: overrides.label ?? 'Mood',
    inputType: overrides.inputType ?? 'score',
    sortOrder: overrides.sortOrder ?? 10,
    isCore: overrides.isCore ?? true,
  };
}

describe('telegram stats options', () => {
  it('builds selectable stats metric options from enabled check-in metrics', () => {
    const options = buildStatsMetricOptions([
      metric({ key: 'sleep', label: 'Sleep', inputType: 'sleep_block', sortOrder: 30 }),
      metric({ key: 'custom_sleep_block', label: 'Body battery', inputType: 'sleep_block', sortOrder: 20 }),
      metric({ key: 'energy', label: 'Energy', inputType: 'score', sortOrder: 10 }),
      metric({ key: 'mood', label: 'Mood', inputType: 'score', sortOrder: 10 }),
    ]);

    expect(options).toEqual([
      { key: 'energy', label: 'Energy' },
      { key: 'mood', label: 'Mood' },
      { key: 'sleep', label: 'Sleep' },
    ]);
  });

  it('checks metric availability against the built selector options', () => {
    const options = buildStatsMetricOptions([
      metric({ key: 'mood', label: 'Mood' }),
    ]);

    expect(isAvailableStatsMetricKey('mood', options)).toBe(true);
    expect(isAvailableStatsMetricKey('unknown_metric', options)).toBe(false);
  });
});
