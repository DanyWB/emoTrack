import {
  CHECKIN_V2_METRICS,
  type CheckinV2MetricKey,
} from '../checkins/checkins-v2.catalog';

export type DailyMetricCatalogEntry = {
  key: string;
  label: string;
  category: string;
  inputType: 'score' | 'sleep_block';
  defaultEnabled: boolean;
  sortOrder: number;
};

export const DAILY_METRIC_CATALOG: DailyMetricCatalogEntry[] = [
  ...CHECKIN_V2_METRICS.map((metric) => ({
    key: metric.key,
    label: metric.label,
    category: metric.type,
    inputType: 'score' as const,
    defaultEnabled: metric.defaultEnabled,
    sortOrder: metric.sortOrder,
  })),
  {
    key: 'sleep',
    label: 'Сон',
    category: 'sleep',
    inputType: 'sleep_block',
    defaultEnabled: true,
    sortOrder: 90,
  },
] as const;

export type DailyMetricCatalogKey = (typeof DAILY_METRIC_CATALOG)[number]['key'];

export const DAILY_METRIC_LABELS_BY_KEY = Object.fromEntries(
  DAILY_METRIC_CATALOG.map((metric) => [metric.key, metric.label]),
) as Record<DailyMetricCatalogKey, string>;

export const LEGACY_TRACKED_METRIC_MAP = {
  sleep: 'trackSleep',
} as const;

export type ProductDailyMetricKey = CheckinV2MetricKey | 'sleep';
