export type CheckinV2MetricType = 'core' | 'optional';
export type CheckinV2TagPolarity = 'positive' | 'neutral' | 'negative' | 'mixed';

export interface CheckinV2ScaleOption {
  ordinalValue: 1 | 2 | 3 | 4 | 5;
  label: string;
}

export interface CheckinV2TagDefinition {
  key: string;
  label: string;
  family: string;
  polarity: CheckinV2TagPolarity;
}

export interface CheckinV2MetricDefinition {
  key: CheckinV2MetricKey;
  type: CheckinV2MetricType;
  label: string;
  prompt: string;
  sortOrder: number;
  defaultEnabled: boolean;
  maxTags: number;
  scale: CheckinV2ScaleOption[];
  tags: CheckinV2TagDefinition[];
}

export type CheckinV2MetricKey =
  | 'mood'
  | 'energy'
  | 'calm'
  | 'motivation'
  | 'overall_state'
  | 'clarity'
  | 'social'
  | 'physical_state';

export const CHECKIN_V2_MAX_OPTIONAL_METRICS = 3;
export const CHECKIN_V2_DEFAULT_MAX_TAGS = 2;

export const CHECKIN_V2_CORE_METRIC_KEYS: CheckinV2MetricKey[] = ['mood', 'energy', 'calm'];
export const CHECKIN_V2_OPTIONAL_METRIC_KEYS: CheckinV2MetricKey[] = [
  'motivation',
  'overall_state',
  'clarity',
  'social',
  'physical_state',
];

export const CHECKIN_V2_METRICS: CheckinV2MetricDefinition[] = [
  {
    key: 'mood',
    type: 'core',
    label: 'Настроение',
    prompt: 'Как у тебя с настроением сейчас?',
    sortOrder: 10,
    defaultEnabled: true,
    maxTags: CHECKIN_V2_DEFAULT_MAX_TAGS,
    scale: [
      { ordinalValue: 5, label: 'Отличное' },
      { ordinalValue: 4, label: 'Хорошее' },
      { ordinalValue: 3, label: 'Нормальное' },
      { ordinalValue: 2, label: 'Плохое' },
      { ordinalValue: 1, label: 'Очень плохое' },
    ],
    tags: [
      { key: 'mood_joyful', label: 'радостное', family: 'positive_affect', polarity: 'positive' },
      { key: 'mood_calm', label: 'спокойное', family: 'stability', polarity: 'positive' },
      { key: 'mood_light', label: 'легкое', family: 'ease', polarity: 'positive' },
      { key: 'mood_playful', label: 'игривое', family: 'positive_affect', polarity: 'positive' },
      { key: 'mood_inspired', label: 'вдохновленное', family: 'motivation', polarity: 'positive' },
      { key: 'mood_sad', label: 'грустное', family: 'sadness', polarity: 'negative' },
      { key: 'mood_irritated', label: 'раздраженное', family: 'irritation', polarity: 'negative' },
      { key: 'mood_anxious', label: 'тревожное', family: 'anxiety', polarity: 'negative' },
      { key: 'mood_empty', label: 'пустое', family: 'emptiness', polarity: 'negative' },
      { key: 'mood_unclear', label: 'непонятное', family: 'unclear', polarity: 'mixed' },
    ],
  },
  {
    key: 'energy',
    type: 'core',
    label: 'Энергия',
    prompt: 'Сколько у тебя сейчас сил?',
    sortOrder: 20,
    defaultEnabled: true,
    maxTags: CHECKIN_V2_DEFAULT_MAX_TAGS,
    scale: [
      { ordinalValue: 5, label: 'Очень много сил' },
      { ordinalValue: 4, label: 'Достаточно сил' },
      { ordinalValue: 3, label: 'Нормально' },
      { ordinalValue: 2, label: 'Мало сил' },
      { ordinalValue: 1, label: 'Совсем нет сил' },
    ],
    tags: [
      { key: 'energy_vigorous', label: 'бодрость', family: 'vitality', polarity: 'positive' },
      { key: 'energy_collected', label: 'собранность', family: 'focus', polarity: 'positive' },
      { key: 'energy_even', label: 'ровная энергия', family: 'stability', polarity: 'positive' },
      { key: 'energy_sleepy', label: 'сонливость', family: 'fatigue', polarity: 'negative' },
      { key: 'energy_sluggish', label: 'вялость', family: 'fatigue', polarity: 'negative' },
      { key: 'energy_exhausted', label: 'истощение', family: 'fatigue', polarity: 'negative' },
      { key: 'energy_overloaded', label: 'перегрузка', family: 'overload', polarity: 'negative' },
      { key: 'energy_broken', label: 'разбитость', family: 'fatigue', polarity: 'negative' },
    ],
  },
  {
    key: 'calm',
    type: 'core',
    label: 'Спокойствие',
    prompt: 'Насколько тебе спокойно внутри?',
    sortOrder: 30,
    defaultEnabled: true,
    maxTags: CHECKIN_V2_DEFAULT_MAX_TAGS,
    scale: [
      { ordinalValue: 5, label: 'Очень спокойно' },
      { ordinalValue: 4, label: 'Спокойно' },
      { ordinalValue: 3, label: 'Нормально' },
      { ordinalValue: 2, label: 'Напряженно' },
      { ordinalValue: 1, label: 'Очень напряженно' },
    ],
    tags: [
      { key: 'calm_relaxed', label: 'расслабленно', family: 'relaxation', polarity: 'positive' },
      { key: 'calm_stable', label: 'устойчиво', family: 'stability', polarity: 'positive' },
      { key: 'calm_peaceful', label: 'спокойно', family: 'stability', polarity: 'positive' },
      { key: 'calm_anxious', label: 'тревожно', family: 'anxiety', polarity: 'negative' },
      { key: 'calm_tense', label: 'напряженно', family: 'tension', polarity: 'negative' },
      { key: 'calm_clenched', label: 'зажато', family: 'tension', polarity: 'negative' },
      { key: 'calm_chaotic', label: 'хаотично', family: 'chaos', polarity: 'negative' },
      { key: 'calm_pressured', label: 'под давлением', family: 'pressure', polarity: 'negative' },
    ],
  },
  {
    key: 'motivation',
    type: 'optional',
    label: 'Мотивация',
    prompt: 'Насколько тебе хочется включаться в дела?',
    sortOrder: 40,
    defaultEnabled: true,
    maxTags: CHECKIN_V2_DEFAULT_MAX_TAGS,
    scale: [
      { ordinalValue: 5, label: 'Очень хочется' },
      { ordinalValue: 4, label: 'Хочется' },
      { ordinalValue: 3, label: 'Нормально' },
      { ordinalValue: 2, label: 'Не хочется' },
      { ordinalValue: 1, label: 'Совсем не хочется' },
    ],
    tags: [
      { key: 'motivation_interesting', label: 'интересно', family: 'interest', polarity: 'positive' },
      { key: 'motivation_easy_start', label: 'легко начать', family: 'activation', polarity: 'positive' },
      { key: 'motivation_focused', label: 'есть фокус', family: 'focus', polarity: 'positive' },
      { key: 'motivation_moving', label: 'хочется двигаться', family: 'activation', polarity: 'positive' },
      { key: 'motivation_neutral', label: 'нейтрально', family: 'neutral', polarity: 'neutral' },
      { key: 'motivation_hard_start', label: 'трудно включиться', family: 'activation', polarity: 'negative' },
      { key: 'motivation_procrastination', label: 'прокрастинация', family: 'avoidance', polarity: 'negative' },
      { key: 'motivation_avoidance', label: 'избегание', family: 'avoidance', polarity: 'negative' },
      { key: 'motivation_indifference', label: 'безразличие', family: 'apathy', polarity: 'negative' },
      { key: 'motivation_resistance', label: 'сопротивление', family: 'resistance', polarity: 'negative' },
    ],
  },
  {
    key: 'overall_state',
    type: 'optional',
    label: 'Общее состояние',
    prompt: 'Как бы ты оценил(а) общее состояние сейчас?',
    sortOrder: 50,
    defaultEnabled: true,
    maxTags: CHECKIN_V2_DEFAULT_MAX_TAGS,
    scale: [
      { ordinalValue: 5, label: 'Отличное' },
      { ordinalValue: 4, label: 'Хорошее' },
      { ordinalValue: 3, label: 'Нормальное' },
      { ordinalValue: 2, label: 'Тяжелое' },
      { ordinalValue: 1, label: 'Очень тяжелое' },
    ],
    tags: [
      { key: 'overall_light', label: 'легко', family: 'ease', polarity: 'positive' },
      { key: 'overall_even', label: 'ровно', family: 'stability', polarity: 'positive' },
      { key: 'overall_stable', label: 'стабильно', family: 'stability', polarity: 'positive' },
      { key: 'overall_collected', label: 'собранно', family: 'focus', polarity: 'positive' },
      { key: 'overall_heavy', label: 'тяжело', family: 'heaviness', polarity: 'negative' },
      { key: 'overall_overloaded', label: 'перегружено', family: 'overload', polarity: 'negative' },
      { key: 'overall_broken', label: 'разбито', family: 'fatigue', polarity: 'negative' },
      { key: 'overall_vulnerable', label: 'уязвимо', family: 'vulnerability', polarity: 'negative' },
      { key: 'overall_unclear', label: 'непонятно', family: 'unclear', polarity: 'mixed' },
    ],
  },
  {
    key: 'clarity',
    type: 'optional',
    label: 'Ясность головы',
    prompt: 'Насколько у тебя ясная голова сейчас?',
    sortOrder: 60,
    defaultEnabled: false,
    maxTags: CHECKIN_V2_DEFAULT_MAX_TAGS,
    scale: [
      { ordinalValue: 5, label: 'Очень ясно' },
      { ordinalValue: 4, label: 'Довольно ясно' },
      { ordinalValue: 3, label: 'Нормально' },
      { ordinalValue: 2, label: 'Туманно' },
      { ordinalValue: 1, label: 'Очень туманно' },
    ],
    tags: [
      { key: 'clarity_clear', label: 'ясно', family: 'clarity', polarity: 'positive' },
      { key: 'clarity_collected', label: 'собранно', family: 'focus', polarity: 'positive' },
      { key: 'clarity_focused', label: 'сфокусированно', family: 'focus', polarity: 'positive' },
      { key: 'clarity_racing', label: 'мысли скачут', family: 'rumination', polarity: 'negative' },
      { key: 'clarity_scattered', label: 'рассеянно', family: 'distraction', polarity: 'negative' },
      { key: 'clarity_foggy', label: 'туманно', family: 'fog', polarity: 'negative' },
      { key: 'clarity_hard_think', label: 'трудно думать', family: 'fog', polarity: 'negative' },
      { key: 'clarity_overloaded', label: 'перегружено мыслями', family: 'overload', polarity: 'negative' },
    ],
  },
  {
    key: 'social',
    type: 'optional',
    label: 'Желание общаться',
    prompt: 'Насколько тебе хочется общаться сейчас?',
    sortOrder: 70,
    defaultEnabled: false,
    maxTags: CHECKIN_V2_DEFAULT_MAX_TAGS,
    scale: [
      { ordinalValue: 5, label: 'Очень хочется' },
      { ordinalValue: 4, label: 'Скорее хочется' },
      { ordinalValue: 3, label: 'Нормально' },
      { ordinalValue: 2, label: 'Скорее не хочется' },
      { ordinalValue: 1, label: 'Совсем не хочется' },
    ],
    tags: [
      { key: 'social_closeness', label: 'хочется близости', family: 'connection', polarity: 'positive' },
      { key: 'social_contact', label: 'хочется общения', family: 'connection', polarity: 'positive' },
      { key: 'social_easy_people', label: 'легко быть с людьми', family: 'connection', polarity: 'positive' },
      { key: 'social_neutral', label: 'нейтрально', family: 'neutral', polarity: 'neutral' },
      { key: 'social_alone', label: 'хочется побыть одному', family: 'solitude', polarity: 'neutral' },
      { key: 'social_fatigue', label: 'социальная усталость', family: 'social_fatigue', polarity: 'negative' },
      { key: 'social_avoidance', label: 'избегание общения', family: 'avoidance', polarity: 'negative' },
      { key: 'social_sensitive', label: 'чувствительность к людям', family: 'sensitivity', polarity: 'mixed' },
    ],
  },
  {
    key: 'physical_state',
    type: 'optional',
    label: 'Физическое состояние',
    prompt: 'Как у тебя с физическим состоянием сейчас?',
    sortOrder: 80,
    defaultEnabled: false,
    maxTags: CHECKIN_V2_DEFAULT_MAX_TAGS,
    scale: [
      { ordinalValue: 5, label: 'Очень хорошо' },
      { ordinalValue: 4, label: 'Хорошо' },
      { ordinalValue: 3, label: 'Нормально' },
      { ordinalValue: 2, label: 'Не очень' },
      { ordinalValue: 1, label: 'Плохо' },
    ],
    tags: [
      { key: 'physical_light_body', label: 'легко в теле', family: 'body_ease', polarity: 'positive' },
      { key: 'physical_vigorous', label: 'бодро', family: 'vitality', polarity: 'positive' },
      { key: 'physical_relaxed', label: 'расслабленно', family: 'relaxation', polarity: 'positive' },
      { key: 'physical_heaviness', label: 'тяжесть', family: 'heaviness', polarity: 'negative' },
      { key: 'physical_tired', label: 'усталость', family: 'fatigue', polarity: 'negative' },
      { key: 'physical_sleepy', label: 'сонливость', family: 'fatigue', polarity: 'negative' },
      { key: 'physical_tension', label: 'напряжение в теле', family: 'tension', polarity: 'negative' },
      { key: 'physical_discomfort', label: 'дискомфорт', family: 'discomfort', polarity: 'negative' },
    ],
  },
];

export const CHECKIN_V2_METRIC_BY_KEY = Object.fromEntries(
  CHECKIN_V2_METRICS.map((metric) => [metric.key, metric]),
) as Record<CheckinV2MetricKey, CheckinV2MetricDefinition>;

export const CHECKIN_V2_SLEEP_QUALITY_SCALE: CheckinV2ScaleOption[] = [
  { ordinalValue: 5, label: 'Очень восстановил' },
  { ordinalValue: 4, label: 'Хорошо восстановил' },
  { ordinalValue: 3, label: 'Нормально' },
  { ordinalValue: 2, label: 'Плохо восстановил' },
  { ordinalValue: 1, label: 'Совсем не восстановил' },
];

export function isCheckinV2MetricKey(value: string): value is CheckinV2MetricKey {
  return value in CHECKIN_V2_METRIC_BY_KEY;
}

export function isCheckinV2CoreMetricKey(value: string): value is CheckinV2MetricKey {
  return CHECKIN_V2_CORE_METRIC_KEYS.includes(value as CheckinV2MetricKey);
}

export function isCheckinV2OptionalMetricKey(value: string): value is CheckinV2MetricKey {
  return CHECKIN_V2_OPTIONAL_METRIC_KEYS.includes(value as CheckinV2MetricKey);
}

export function ordinalToSignedValue(value: number): number {
  return value - 3;
}

export function mapLegacyScoreToOrdinal(value: number): 1 | 2 | 3 | 4 | 5 {
  if (value <= 2) {
    return 1;
  }

  if (value <= 4) {
    return 2;
  }

  if (value <= 6) {
    return 3;
  }

  if (value <= 8) {
    return 4;
  }

  return 5;
}

export function mapLegacyStressToCalmOrdinal(value: number): 1 | 2 | 3 | 4 | 5 {
  const mapped = 6 - mapLegacyScoreToOrdinal(value);
  return mapped as 1 | 2 | 3 | 4 | 5;
}

export function getScaleLabel(
  scale: CheckinV2ScaleOption[],
  ordinalValue: number | null | undefined,
): string | null {
  if (typeof ordinalValue !== 'number') {
    return null;
  }

  return scale.find((option) => option.ordinalValue === ordinalValue)?.label ?? null;
}
