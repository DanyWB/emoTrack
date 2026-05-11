export type DailyMetricCatalogEntry = {
  key: string;
  label: string;
  category: string;
  inputType: 'score' | 'sleep_block';
  defaultEnabled: boolean;
  sortOrder: number;
};

export const DAILY_METRIC_CATALOG: DailyMetricCatalogEntry[] = [
  {
    key: 'mood',
    label: 'Настроение',
    category: 'core',
    inputType: 'score',
    defaultEnabled: true,
    sortOrder: 10,
  },
  {
    key: 'energy',
    label: 'Энергия',
    category: 'core',
    inputType: 'score',
    defaultEnabled: true,
    sortOrder: 20,
  },
  {
    key: 'stress',
    label: 'Стресс',
    category: 'core',
    inputType: 'score',
    defaultEnabled: true,
    sortOrder: 30,
  },
  {
    key: 'sleep',
    label: 'Сон',
    category: 'core',
    inputType: 'sleep_block',
    defaultEnabled: true,
    sortOrder: 40,
  },
  {
    key: 'joy',
    label: 'Радость',
    category: 'emotion',
    inputType: 'score',
    defaultEnabled: false,
    sortOrder: 50,
  },
  {
    key: 'sadness',
    label: 'Грусть',
    category: 'emotion',
    inputType: 'score',
    defaultEnabled: false,
    sortOrder: 60,
  },
  {
    key: 'anxiety_score',
    label: 'Тревога',
    category: 'emotion',
    inputType: 'score',
    defaultEnabled: false,
    sortOrder: 70,
  },
  {
    key: 'irritation_score',
    label: 'Раздражение',
    category: 'emotion',
    inputType: 'score',
    defaultEnabled: false,
    sortOrder: 80,
  },
  {
    key: 'motivation_score',
    label: 'Мотивация',
    category: 'state',
    inputType: 'score',
    defaultEnabled: false,
    sortOrder: 90,
  },
  {
    key: 'concentration',
    label: 'Концентрация',
    category: 'state',
    inputType: 'score',
    defaultEnabled: false,
    sortOrder: 100,
  },
  {
    key: 'wellbeing',
    label: 'Самочувствие',
    category: 'state',
    inputType: 'score',
    defaultEnabled: false,
    sortOrder: 110,
  },
] as const;

export type DailyMetricCatalogKey = (typeof DAILY_METRIC_CATALOG)[number]['key'];

export const DAILY_METRIC_LABELS_BY_KEY = Object.fromEntries(
  DAILY_METRIC_CATALOG.map((metric) => [metric.key, metric.label]),
) as Record<DailyMetricCatalogKey, string>;

export const LEGACY_TRACKED_METRIC_MAP = {
  mood: 'trackMood',
  energy: 'trackEnergy',
  stress: 'trackStress',
  sleep: 'trackSleep',
} as const;
