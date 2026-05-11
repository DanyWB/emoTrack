import type { EnabledCheckinMetric } from '../daily-metrics/daily-metrics.service';
import type { StatsSelectedMetricKey } from '../stats/stats.types';

export interface StatsMetricOption {
  key: StatsSelectedMetricKey;
  label: string;
}

export function buildStatsMetricOptions(enabledMetrics: EnabledCheckinMetric[]): StatsMetricOption[] {
  return enabledMetrics
    .filter((metric) => metric.inputType === 'score' || metric.key === 'sleep')
    .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
    .map((metric) => ({
      key: metric.key as StatsSelectedMetricKey,
      label: metric.label,
    }));
}

export function isAvailableStatsMetricKey(
  metricKey: StatsSelectedMetricKey,
  options: StatsMetricOption[],
): boolean {
  return options.some((option) => option.key === metricKey);
}
