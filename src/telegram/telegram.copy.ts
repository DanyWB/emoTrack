import type { EventType, SleepMode, SummaryPeriodType } from '@prisma/client';

import {
  getCoreCheckinStepPosition,
  type CheckinStepConfig,
  type CoreCheckinState,
} from '../checkins/checkins.steps';
import { formatDateKey } from '../common/utils/date.utils';
import { DAILY_METRIC_LABELS_BY_KEY, type DailyMetricCatalogKey } from '../daily-metrics/daily-metrics.catalog';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  work: 'Работа',
  study: 'Учеба',
  relationships: 'Отношения',
  family: 'Семья',
  friends: 'Друзья',
  health: 'Здоровье',
  sleep: 'Сон',
  sport: 'Спорт',
  rest: 'Отдых',
  money: 'Финансы',
  travel: 'Путешествия',
  other: 'Другое',
};

export const SLEEP_MODE_LABELS: Record<SleepMode, string> = {
  hours: 'Только часы',
  quality: 'Только качество',
  both: 'Часы и качество',
};

export const STATS_PERIOD_LABELS: Record<SummaryPeriodType, string> = {
  d7: '7 дней',
  d30: '30 дней',
  all: 'За всё время',
};

export const STATS_METRIC_LABELS = {
  mood: 'Настроение',
  energy: 'Энергия',
  stress: 'Стресс',
  sleepHours: 'Часы сна',
  sleepQuality: 'Качество сна',
} as const;

export const TELEGRAM_COMMANDS = [
  { command: 'start', description: 'Старт и вход в бота' },
  { command: 'help', description: 'Краткая помощь' },
  { command: 'terms', description: 'Пользовательское соглашение' },
  { command: 'checkin', description: 'Отметить состояние' },
  { command: 'event', description: 'Добавить событие' },
  { command: 'history', description: 'Последние записи' },
  { command: 'stats', description: 'Сводка и графики' },
  { command: 'settings', description: 'Настройки' },
] as const;

export const DAILY_TRACKING_LABELS = {
  trackMood: 'Настроение',
  trackEnergy: 'Энергия',
  trackStress: 'Стресс',
  trackSleep: 'Сон',
} as const;

export const CORE_TRACKED_METRIC_LABELS = {
  mood: 'Настроение',
  energy: 'Энергия',
  stress: 'Стресс',
  sleep: 'Сон',
} as const;

export const WEEKDAY_LABELS = {
  0: 'воскресенье',
  1: 'понедельник',
  2: 'вторник',
  3: 'среда',
  4: 'четверг',
  5: 'пятница',
  6: 'суббота',
} as const;

export const telegramCopy = {
  buttons: {
    consentAccept: '✅ Согласен',
    cancel: 'Отмена',
    back: 'Назад',
    historyOpen: 'Открыть',
    historyBackToList: 'К списку',
    skip: 'Пропустить',
    firstCheckinStart: 'Начать check-in',
    later: 'Позже',
    addNote: 'Добавить заметку',
    chooseTags: 'Выбрать теги',
    tagsDone: 'Готово',
    addEvent: 'Добавить событие',
    historyMore: 'Еще',
    stats7d: '7 дней',
    stats30d: '30 дней',
    statsAll: 'За всё время',
    settingsToggleRemindersOn: 'Напоминания: вкл',
    settingsToggleRemindersOff: 'Напоминания: выкл',
    settingsEditReminderTime: 'Изменить время',
    settingsSleepMode: 'Режим сна',
    settingsDailyMetrics: 'Критерии check-in',
    settingsTrackMoodOn: 'Настроение: вкл',
    settingsTrackMoodOff: 'Настроение: выкл',
    settingsTrackEnergyOn: 'Энергия: вкл',
    settingsTrackEnergyOff: 'Энергия: выкл',
    settingsTrackStressOn: 'Стресс: вкл',
    settingsTrackStressOff: 'Стресс: выкл',
    settingsTrackSleepOn: 'Сон: вкл',
    settingsTrackSleepOff: 'Сон: выкл',
    sleepModeHours: 'Только часы',
    sleepModeQuality: 'Только качество',
    sleepModeBoth: 'Часы и качество',
  },
  startup: {
    alreadyReady: '👋 Профиль уже настроен. Можно отметить состояние или открыть нужный раздел.',
    unknownInput: 'Не понял сообщение. Выбери действие из меню или используй команду.',
  },
  placeholders: {
    help: 'Справка временно недоступна.',
  },
  common: {
    cancelled: 'Действие отменено.',
    backUnavailable: 'Назад на этом шаге недоступно.',
    actionNotAllowed: 'Это действие сейчас недоступно. Продолжим текущий шаг.',
    updated: 'Сохранено.',
    unexpectedError: 'Что-то пошло не так. Попробуй еще раз.',
  },
  onboarding: {
    intro: '👋 Привет! emoTrack помогает замечать, как меняется состояние по дням.',
    disclaimer: '📝 Это инструмент самонаблюдения. Он не заменяет специалиста и не ставит диагнозы.',
    consentPrompt:
      'Чтобы пользоваться ботом, нужно принять пользовательское соглашение. Перед согласием можно открыть /terms.\n\nГотов продолжить?',
    consentAccepted: '✅ Соглашение принято. Теперь укажи время напоминания в формате HH:mm.',
    consentDeclined: 'Без принятия соглашения бот не может сохранять записи.',
    reminderPrompt: '⏰ Введи время напоминания в формате HH:mm, например 21:30.',
    reminderSaved: '✅ Время напоминания сохранено.',
    completed: '✅ Базовая настройка завершена.',
    firstCheckinOffer: 'Хочешь сделать первый check-in прямо сейчас?',
    firstCheckinDeferred: 'Хорошо. Когда будешь готов, запусти /checkin.',
    incompleteRedirect: 'Сначала завершим настройку. Продолжим с текущего шага.',
  },
  terms: {
    title: '📄 Пользовательское соглашение',
    text: [
      'Это временный текст соглашения для текущего этапа разработки.',
      '',
      'Сейчас важно следующее:',
      '- бот хранит ваши записи, события и настройки, чтобы показывать историю, статистику и напоминания',
      '- emoTrack не является медицинским инструментом и не заменяет специалиста',
      '- вы управляете тем, какие данные отмечаете в ежедневном check-in',
    ].join('\n'),
    acceptPrompt: 'Если условия подходят, нажми «Согласен».',
    accessRequired:
      'Чтобы пользоваться ботом, сначала нужно принять пользовательское соглашение. Открой /terms и нажми «Согласен».',
    alreadyAccepted: '✅ Соглашение уже принято.',
  },
  checkin: {
    started: '🌤 Отметь состояние за сегодня.',
    resumed: '↩️ Продолжим текущий check-in.',
    interrupted: 'Текущий check-in сбился. Начни заново командой /checkin.',
    notePrompt: 'Если хочешь, можно добавить заметку за день.',
    noteInputPrompt: 'Отправь текст заметки одним сообщением.',
    tagsPrompt: 'Если хочешь, можно отметить теги состояния.',
    tagsSelectionPrompt: 'Выбери один или несколько тегов и нажми «Готово».',
    tagsSaved: 'Теги сохранены.',
    noActiveTags: 'Сейчас нет активных тегов. Пропускаем этот шаг.',
    addEventPrompt: 'Если хочешь, можно добавить событие за этот день.',
    repeatedStepPrompt: 'Продолжим текущий шаг.',
  },
  event: {
    startedStandalone: '🗂 Добавим событие.',
    typePrompt: 'Выбери тип события.',
    titlePrompt: 'Укажи короткое название события.',
    scorePrompt: 'Оцени событие от 0 до 10, где 0 = ужасно, 10 = прекрасно.',
    descriptionPrompt: 'Можно добавить описание одним сообщением или нажать «Пропустить».',
    endDatePrompt:
      'Если событие длилось несколько дней, отправь дату окончания в формате YYYY-MM-DD. Для однодневного события нажми «Пропустить».',
    savedStandalone: 'Событие сохранено.',
  },
  history: {
    title: '📚 Последние записи:',
    moreTitle: '📚 Еще записи:',
    detailTitlePrefix: '📝 Запись за',
    empty: 'Пока записей нет. Начни с /checkin.',
    stale: 'Этот список уже неактуален. Открой /history снова.',
  },
  stats: {
    periodPrompt: '📊 Выбери период статистики.',
    metricPromptPrefix: '📊 Выбери метрику для периода',
    metricPromptHint:
      'В боте доступна краткая статистика по одной метрике за раз. Расширенная аналитика появится позже в веб-панели.',
    loading: '📊 Собираю сводку…',
    empty: 'Недостаточно данных для сводки. Сделай несколько отметок и попробуй снова.',
    selectedMetricLead: 'Краткая статистика по одной метрике.',
    titlePrefix: 'Сводка за период',
    countsLabel: 'Кратко',
    averagesLabel: 'Средние значения',
    extraMetricsLabel: 'Доп. метрики',
    sleepLabel: 'Сон',
    daysLabel: 'Опорные дни',
    bestDayLabel: 'Лучший день',
    worstDayLabel: 'Сложный день',
    comparisonLabel: 'Изменение к предыдущему периоду',
    patternsLabel: 'Наблюдения',
    eventsBreakdownLabel: 'События по типам',
    lowDataLead: 'Данных пока мало, поэтому сводка предварительная.',
    lowDataNote: 'Подробная сводка и графики появятся, когда будет хотя бы 3 записи за период.',
    chartCombinedCaption: 'График настроения, энергии и стресса.',
    chartSelectedMetricPrefix: 'График',
    chartSleepCaption: 'График сна.',
    chartMoodStripCaption: 'Компактная шкала настроения по дням.',
    chartUnavailable: 'Сейчас не удалось построить графики. Текстовая сводка доступна.',
    sleepHoursMoodPattern: 'При более долгом сне настроение в среднем выше на {delta}.',
    sleepHoursEnergyPattern: 'При более долгом сне энергия в среднем выше на {delta}.',
    sleepQualityStressPattern: 'При более низком качестве сна стресс в среднем выше на {delta}.',
    weekdayMoodPattern: 'По настроению чаще лучше проходит {best}, сложнее — {worst}.',
    topEventTypePattern: 'Чаще всего встречалось: {label} ({count}).',
    eventMoodHigherPattern: 'В дни с событиями настроение в среднем выше на {delta}.',
    eventMoodLowerPattern: 'В дни с событиями настроение в среднем ниже на {delta}.',
  },
  settings: {
    title: '⚙️ Настройки:',
    remindersSectionTitle: '⏰ Напоминания',
    checkinSectionTitle: '🧩 Ежедневный check-in',
    remindersEnabled: 'Напоминания: включены',
    remindersDisabled: 'Напоминания: выключены',
    remindersRuntimeLabel: 'Автонапоминания',
    remindersRuntimeActive: 'Автонапоминания: активны',
    remindersRuntimeDisabled: 'Автонапоминания: выключены',
    remindersRuntimeUnavailable: 'Автонапоминания: недоступны в этой среде',
    weeklyDigestLabel: 'Еженедельная сводка',
    weeklyDigestActive: 'по воскресеньям в это же время',
    weeklyDigestDisabled: 'выключена вместе с напоминаниями',
    weeklyDigestUnavailable: 'недоступна в этой среде',
    reminderTimeLabel: 'Время напоминания',
    sleepModeLabel: 'Режим сна',
    dailyTrackingLabel: 'Критерии',
    dailyMetricsTitle: 'Критерии check-in:',
    dailyMetricsHint: 'Выбери, что бот спрашивает в ежедневной отметке. Прошлые записи это не меняет.',
    dailyMetricsActiveLabel: 'Сейчас активно',
    dailyMetricsGuard: 'Нужно оставить хотя бы один критерий.',
    dailyMetricsStale: 'Этот экран уже неактуален. Показываю текущие настройки.',
    reminderTimePrompt: '⏰ Введи новое время в формате HH:mm.',
    sleepModePrompt: '😴 Выбери режим сна.',
    reminderTimeUpdated: 'Время напоминания обновлено.',
    reminderTimeSavedWithoutDelivery:
      'Время напоминания обновлено. Автонапоминания и еженедельная сводка в этой среде сейчас не отправляются.',
    sleepModeUpdated: 'Режим сна обновлен.',
    remindersEnabledUpdated: 'Напоминания включены.',
    remindersEnabledWithoutDelivery:
      'Напоминания включены. Время сохранено, но фоновая отправка в этой среде недоступна.',
    remindersDisabledUpdated: 'Напоминания выключены. Ежедневные и еженедельные отправки остановлены.',
    dailyTrackingUpdated: 'Критерии check-in обновлены.',
  },
  reminders: {
    dailyPrompt: 'Напоминание: отметь состояние за сегодня командой /checkin.',
    weeklyDigestTitle: 'Еженедельная сводка',
    weeklyDigestLead: 'Краткий итог за последние 7 дней.',
  },
  help: {
    text: [
      '🧭 emoTrack помогает отслеживать состояние, сон и события по дням.',
      '',
      'Команды:',
      '/start — запуск и возвращение в бота',
      '/terms — пользовательское соглашение',
      '/checkin — отметить состояние',
      '/event — добавить событие',
      '/history — последние записи',
      '/stats — сводка и графики',
      '/settings — настройки',
      '/help — помощь',
      '',
      'Это не диагностика и не замена специалиста.',
    ].join('\n'),
  },
  validation: {
    invalidTime: 'Некорректное время. Используй формат HH:mm, например 09:15.',
    invalidScore: 'Нужно целое число от 0 до 10.',
    invalidSleepHours: 'Нужно число от 0 до 24. Можно с дробной частью, например 7.5.',
    invalidNoteLength: 'Заметка слишком длинная или пустая. Отправь более короткий текст.',
    invalidTagSelection: 'Не удалось сохранить теги. Выбери теги из списка и попробуй снова.',
    invalidEventType: 'Выбери тип события кнопкой ниже.',
    invalidEventTitle: 'Укажи название события короче.',
    invalidEventScore: 'Оценка события должна быть целым числом от 0 до 10.',
    invalidEventDescription: 'Описание слишком длинное или пустое. Отправь более короткий текст.',
    invalidEventEndDate:
      'Некорректная дата окончания. Используй формат YYYY-MM-DD, и дата не должна быть раньше даты начала события.',
    invalidDailyTrackingConfiguration:
      'Нужно оставить хотя бы одну ежедневную метрику.',
    missingDailyMetricValue: 'Нужно заполнить хотя бы одну ежедневную метрику, прежде чем завершать запись.',
  },
} as const;

export interface CheckinConfirmationData {
  moodScore?: number | null;
  energyScore?: number | null;
  stressScore?: number | null;
  sleepHours?: number;
  sleepQuality?: number;
  extraMetricScores?: Array<{
    key: DailyMetricCatalogKey;
    label: string;
    value: number;
  }>;
  updated: boolean;
  noteAdded?: boolean;
  tagsCount?: number;
  eventAdded?: boolean;
}

export interface HistoryEntryData {
  id?: string;
  entryDate: Date;
  moodScore: number | null;
  energyScore: number | null;
  stressScore: number | null;
  sleepHours?: number;
  sleepQuality?: number;
  extraMetricScores?: Array<{
    key: DailyMetricCatalogKey;
    label: string;
    value: number;
  }>;
  hasNote: boolean;
  tagsCount?: number;
  eventsCount: number;
}

export interface HistoryEntryDetailData {
  entryDate: Date;
  moodScore: number | null;
  energyScore: number | null;
  stressScore: number | null;
  sleepHours?: number;
  sleepQuality?: number;
  extraMetricScores?: Array<{
    key: DailyMetricCatalogKey;
    label: string;
    value: number;
  }>;
  noteText?: string | null;
  tags?: Array<{
    id: string;
    label: string;
  }>;
  events?: Array<{
    id: string;
    eventType: EventType;
    title: string;
    description?: string | null;
    eventScore: number;
    eventDate: Date;
    eventEndDate?: Date | null;
  }>;
}

interface HistoryEntriesFormatOptions {
  title?: string;
}

export interface SettingsViewData {
  remindersEnabled: boolean;
  reminderTime?: string | null;
  sleepMode: SleepMode;
  backgroundDeliveryAvailable: boolean;
  trackedMetricsSummary?: string;
  trackMood: boolean;
  trackEnergy: boolean;
  trackStress: boolean;
  trackSleep: boolean;
}

export interface SettingsMetricOptionData {
  key: DailyMetricCatalogKey;
  label: string;
  enabled: boolean;
}

export function formatCheckinConfirmation(data: CheckinConfirmationData): string {
  const lines = [data.updated ? 'Готово. Запись за сегодня обновлена.' : 'Готово. Запись за сегодня сохранена.'];

  if (typeof data.moodScore === 'number') {
    lines.push(`Настроение: ${data.moodScore}`);
  }

  if (typeof data.energyScore === 'number') {
    lines.push(`Энергия: ${data.energyScore}`);
  }

  if (typeof data.stressScore === 'number') {
    lines.push(`Стресс: ${data.stressScore}`);
  }

  for (const metric of data.extraMetricScores ?? []) {
    lines.push(`${metric.label}: ${metric.value}`);
  }

  if (typeof data.sleepHours === 'number' && typeof data.sleepQuality === 'number') {
    lines.push(`Сон: ${data.sleepHours} ч, качество ${data.sleepQuality}`);
  } else if (typeof data.sleepHours === 'number') {
    lines.push(`Сон: ${data.sleepHours} ч`);
  } else if (typeof data.sleepQuality === 'number') {
    lines.push(`Качество сна: ${data.sleepQuality}`);
  }

  const extras: string[] = [];

  if (data.noteAdded) {
    extras.push('заметка');
  }

  if ((data.tagsCount ?? 0) > 0) {
    extras.push(formatTagsCount(data.tagsCount ?? 0));
  }

  if (data.eventAdded) {
    extras.push('событие');
  }

  if (extras.length > 0) {
    lines.push(`Дополнительно: ${extras.join(', ')}`);
  }

  return lines.join('\n');
}

export function getCheckinPrompt(
  state: CoreCheckinState,
  config: CheckinStepConfig,
): string {
  const stepPosition = getCoreCheckinStepPosition(config, state);
  const stepNumber = stepPosition?.stepNumber ?? 1;
  const totalSteps = stepPosition?.totalSteps ?? 1;

  switch (state) {
    case 'checkin_mood':
      return `Шаг ${stepNumber}/${totalSteps}. Оцени настроение: 0..10`;
    case 'checkin_energy':
      return `Шаг ${stepNumber}/${totalSteps}. Оцени энергию: 0..10`;
    case 'checkin_stress':
      return `Шаг ${stepNumber}/${totalSteps}. Оцени стресс: 0..10`;
    case 'checkin_sleep_hours':
      return `Шаг ${stepNumber}/${totalSteps}. Сколько часов спал? Можно число от 0 до 24, например 7.5`;
    case 'checkin_sleep_quality':
      return `Шаг ${stepNumber}/${totalSteps}. Оцени качество сна: 0..10`;
  }
}

export function getExtraMetricCheckinPrompt(label: string, stepNumber: number, totalSteps: number): string {
  return `Шаг ${stepNumber}/${totalSteps}. Оцени ${label.toLowerCase()}: 0..10`;
}

function formatTagsCount(tagsCount: number): string {
  if (tagsCount % 10 === 1 && tagsCount % 100 !== 11) {
    return `${tagsCount} тег`;
  }

  if (
    tagsCount % 10 >= 2 &&
    tagsCount % 10 <= 4 &&
    (tagsCount % 100 < 12 || tagsCount % 100 > 14)
  ) {
    return `${tagsCount} тега`;
  }

  return `${tagsCount} тегов`;
}

export function formatSettingsText(data: SettingsViewData): string {
  const lines = [
    telegramCopy.settings.title,
    '',
    telegramCopy.settings.remindersSectionTitle,
    `- ${data.remindersEnabled ? telegramCopy.settings.remindersEnabled : telegramCopy.settings.remindersDisabled}`,
    `- ${formatReminderRuntimeLine(data)}`,
    `- ${telegramCopy.settings.reminderTimeLabel}: ${data.reminderTime ?? '—'}`,
    `- ${telegramCopy.settings.weeklyDigestLabel}: ${formatWeeklyDigestRuntimeLine(data)}`,
    '',
    telegramCopy.settings.checkinSectionTitle,
    `- ${telegramCopy.settings.sleepModeLabel}: ${SLEEP_MODE_LABELS[data.sleepMode]}`,
    `- ${telegramCopy.settings.dailyTrackingLabel}: ${formatTrackedMetricsSummary(data)}`,
  ];

  return lines.join('\n');
}

export function formatDailyMetricsSettingsText(metrics: SettingsMetricOptionData[]): string {
  const activeMetrics = metrics.filter((metric) => metric.enabled).map((metric) => metric.label.toLowerCase());
  const lines = [
    telegramCopy.settings.dailyMetricsTitle,
    telegramCopy.settings.dailyMetricsHint,
    '',
    `${telegramCopy.settings.dailyMetricsActiveLabel}: ${activeMetrics.length > 0 ? activeMetrics.join(', ') : '—'}`,
    '',
  ];

  for (const metric of metrics) {
    lines.push(`• ${metric.label}: ${metric.enabled ? 'вкл' : 'выкл'}`);
  }

  lines.push('', telegramCopy.settings.dailyMetricsGuard);
  return lines.join('\n');
}

export function formatReminderToggleMessage(
  remindersEnabled: boolean,
  backgroundDeliveryAvailable: boolean,
): string {
  if (!remindersEnabled) {
    return telegramCopy.settings.remindersDisabledUpdated;
  }

  if (!backgroundDeliveryAvailable) {
    return telegramCopy.settings.remindersEnabledWithoutDelivery;
  }

  return telegramCopy.settings.remindersEnabledUpdated;
}

export function formatStandaloneEventSaved(totalOccurrences: number): string {
  void totalOccurrences;
  return telegramCopy.event.savedStandalone;
}

export function formatReminderTimeUpdateMessage(
  remindersEnabled: boolean,
  backgroundDeliveryAvailable: boolean,
): string {
  if (remindersEnabled && !backgroundDeliveryAvailable) {
    return telegramCopy.settings.reminderTimeSavedWithoutDelivery;
  }

  return telegramCopy.settings.reminderTimeUpdated;
}

export function getSettingsToggleButtonLabel(remindersEnabled: boolean): string {
  return remindersEnabled
    ? telegramCopy.buttons.settingsToggleRemindersOn
    : telegramCopy.buttons.settingsToggleRemindersOff;
}

export function getTrackedMetricToggleButtonLabel(
  metric: keyof typeof DAILY_TRACKING_LABELS,
  enabled: boolean,
): string {
  if (metric === 'trackMood') {
    return enabled ? telegramCopy.buttons.settingsTrackMoodOn : telegramCopy.buttons.settingsTrackMoodOff;
  }

  if (metric === 'trackEnergy') {
    return enabled ? telegramCopy.buttons.settingsTrackEnergyOn : telegramCopy.buttons.settingsTrackEnergyOff;
  }

  if (metric === 'trackStress') {
    return enabled ? telegramCopy.buttons.settingsTrackStressOn : telegramCopy.buttons.settingsTrackStressOff;
  }

  return enabled ? telegramCopy.buttons.settingsTrackSleepOn : telegramCopy.buttons.settingsTrackSleepOff;
}

export function getSettingsMetricToggleButtonLabel(label: string, enabled: boolean): string {
  return `${label}: ${enabled ? 'вкл' : 'выкл'}`;
}

export function formatHistoryEntries(
  entries: HistoryEntryData[],
  options: HistoryEntriesFormatOptions = {},
): string {
  if (entries.length === 0) {
    return telegramCopy.history.empty;
  }

  const items = entries.map((entry) => {
    const lines = [`• ${formatHistoryDate(entry.entryDate)}`];
    const coreMetricsLine = formatHistoryCoreMetrics(entry);
    const extraMetricsLine = formatHistoryExtraMetrics(entry);

    if (coreMetricsLine) {
      lines.push(coreMetricsLine);
    } else if (extraMetricsLine) {
      lines.push(extraMetricsLine);
    }

    const sleepLine = formatHistorySleep(entry);
    if (sleepLine) {
      lines.push(sleepLine);
    }

    if (coreMetricsLine && extraMetricsLine) {
      lines.push(extraMetricsLine);
    }

    lines.push(formatHistoryEntrySummary(entry.hasNote, entry.tagsCount ?? 0, entry.eventsCount));

    return lines.join('\n');
  });

  return `${options.title ?? telegramCopy.history.title}\n\n${items.join('\n\n')}`;
}

export function formatHistoryEntryDetail(entry: HistoryEntryDetailData): string {
  const lines = [`${telegramCopy.history.detailTitlePrefix} ${formatHistoryDate(entry.entryDate)}`];
  const coreMetricsLine = formatHistoryCoreMetrics(entry);
  const extraMetricsLine = formatHistoryExtraMetrics(entry);
  const sleepLine = formatHistorySleep(entry);

  if (coreMetricsLine) {
    lines.push('', 'Состояние', coreMetricsLine);
  } else if (extraMetricsLine) {
    lines.push('', 'Состояние', extraMetricsLine);
  }

  if (sleepLine) {
    lines.push('', 'Сон', formatHistorySleepValue(entry));
  }

  if (coreMetricsLine && extraMetricsLine) {
    lines.push(extraMetricsLine);
  }

  if (entry.noteText?.trim()) {
    lines.push('', 'Заметка');
    lines.push(entry.noteText.trim());
  }

  if (entry.tags && entry.tags.length > 0) {
    lines.push('', 'Теги');
    lines.push(...entry.tags.map((tag) => `- ${tag.label}`));
  }

  if (entry.events && entry.events.length > 0) {
    lines.push('', 'События');

    for (const event of entry.events) {
      const eventTypeLabel = EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;
      const eventRange = formatHistoryEventRange(event.eventDate, event.eventEndDate ?? null);
      const summaryParts = [`${eventTypeLabel}: ${event.title}`, `оценка ${event.eventScore}`];

      if (eventRange) {
        summaryParts.push(eventRange);
      }

      lines.push(`- ${summaryParts.join(' · ')}`);

      if (event.description?.trim()) {
        lines.push(`  ${event.description.trim()}`);
      }
    }
  }

  return lines.join('\n');
}

function formatMetricOrDash(value: number | null): string {
  return typeof value === 'number' ? String(value) : '—';
}

function formatHistoryCoreMetrics(
  entry: Pick<HistoryEntryData, 'moodScore' | 'energyScore' | 'stressScore'>,
): string | null {
  if (
    typeof entry.moodScore !== 'number' &&
    typeof entry.energyScore !== 'number' &&
    typeof entry.stressScore !== 'number'
  ) {
    return null;
  }

  return `Настроение / энергия / стресс: ${formatMetricOrDash(entry.moodScore)} / ${formatMetricOrDash(entry.energyScore)} / ${formatMetricOrDash(entry.stressScore)}`;
}

function formatHistoryDate(entryDate: Date): string {
  const [year, month, day] = formatDateKey(entryDate).split('-');
  return `${day}.${month}.${year}`;
}

function formatHistorySleep(
  entry: Pick<HistoryEntryData, 'sleepHours' | 'sleepQuality'>,
): string | null {
  if (typeof entry.sleepHours === 'number' && typeof entry.sleepQuality === 'number') {
    return `Сон: ${entry.sleepHours} ч, качество ${entry.sleepQuality}`;
  }

  if (typeof entry.sleepHours === 'number') {
    return `Сон: ${entry.sleepHours} ч`;
  }

  if (typeof entry.sleepQuality === 'number') {
    return `Качество сна: ${entry.sleepQuality}`;
  }

  return null;
}

function formatHistorySleepValue(
  entry: Pick<HistoryEntryData, 'sleepHours' | 'sleepQuality'>,
): string {
  if (typeof entry.sleepHours === 'number' && typeof entry.sleepQuality === 'number') {
    return `${entry.sleepHours} ч, качество ${entry.sleepQuality}`;
  }

  if (typeof entry.sleepHours === 'number') {
    return `${entry.sleepHours} ч`;
  }

  if (typeof entry.sleepQuality === 'number') {
    return `Качество ${entry.sleepQuality}`;
  }

  return '—';
}

function formatHistoryExtraMetrics(
  entry: Pick<HistoryEntryData, 'extraMetricScores'>,
): string | null {
  if (!entry.extraMetricScores || entry.extraMetricScores.length === 0) {
    return null;
  }

  const summary = entry.extraMetricScores
    .map((metric) => `${metric.label} ${metric.value}`)
    .join(', ');

  return `Доп. метрики: ${summary}`;
}

function formatHistoryEntrySummary(hasNote: boolean, tagsCount: number, eventsCount: number): string {
  const markers: string[] = [];

  if (hasNote) {
    markers.push('Есть заметка');
  }

  if (tagsCount > 0) {
    markers.push(formatTagsCount(tagsCount));
  }

  markers.push(formatEventsCount(eventsCount));

  return markers.join(' · ');
}

function formatEventsCount(eventsCount: number): string {
  if (eventsCount % 10 === 1 && eventsCount % 100 !== 11) {
    return `${eventsCount} событие`;
  }

  if (
    eventsCount % 10 >= 2 &&
    eventsCount % 10 <= 4 &&
    (eventsCount % 100 < 12 || eventsCount % 100 > 14)
  ) {
    return `${eventsCount} события`;
  }

  return `${eventsCount} событий`;
}

function formatHistoryEventRange(eventDate: Date, eventEndDate: Date | null): string | null {
  if (!eventEndDate || formatDateKey(eventDate) === formatDateKey(eventEndDate)) {
    return null;
  }

  const start = formatHistoryDate(eventDate);
  const end = formatHistoryDate(eventEndDate);
  return `${start}–${end}`;
}

function formatReminderRuntimeLine(data: SettingsViewData): string {
  if (!data.remindersEnabled) {
    return telegramCopy.settings.remindersRuntimeDisabled;
  }

  if (!data.backgroundDeliveryAvailable) {
    return telegramCopy.settings.remindersRuntimeUnavailable;
  }

  return telegramCopy.settings.remindersRuntimeActive;
}

function formatWeeklyDigestRuntimeLine(data: SettingsViewData): string {
  if (!data.remindersEnabled) {
    return telegramCopy.settings.weeklyDigestDisabled;
  }

  if (!data.backgroundDeliveryAvailable) {
    return telegramCopy.settings.weeklyDigestUnavailable;
  }

  return telegramCopy.settings.weeklyDigestActive;
}

function formatTrackedMetricsSummary(
  data: Pick<
    SettingsViewData,
    'trackedMetricsSummary' | 'trackMood' | 'trackEnergy' | 'trackStress' | 'trackSleep'
  >,
): string {
  if (data.trackedMetricsSummary) {
    return data.trackedMetricsSummary;
  }

  const enabledMetrics = (
    Object.entries(DAILY_TRACKING_LABELS) as Array<
      [keyof typeof DAILY_TRACKING_LABELS, (typeof DAILY_TRACKING_LABELS)[keyof typeof DAILY_TRACKING_LABELS]]
    >
  )
    .filter(([key]) => data[key])
    .map(([, label]) => label.toLowerCase());

  if (enabledMetrics.length === 0) {
    return '—';
  }

  return enabledMetrics.join(', ');
}

export function getDailyMetricLabel(key: DailyMetricCatalogKey): string {
  return DAILY_METRIC_LABELS_BY_KEY[key];
}

export function formatStatsMetricPrompt(periodType: SummaryPeriodType): string {
  return [
    `${telegramCopy.stats.metricPromptPrefix}: ${STATS_PERIOD_LABELS[periodType]}.`,
    telegramCopy.stats.metricPromptHint,
  ].join('\n');
}

export function formatStatsSelectedMetricChartCaption(
  metricLabel: string,
  periodType: SummaryPeriodType,
): string {
  return `${telegramCopy.stats.chartSelectedMetricPrefix}: ${metricLabel}, ${STATS_PERIOD_LABELS[periodType].toLowerCase()}.`;
}

export function formatStatsSleepChartCaption(periodType: SummaryPeriodType): string {
  return `${telegramCopy.stats.chartSelectedMetricPrefix}: Сон, ${STATS_PERIOD_LABELS[periodType].toLowerCase()}.`;
}


