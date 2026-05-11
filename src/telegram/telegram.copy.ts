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
  { command: 'start', description: '👋 Старт и вход в бота' },
  { command: 'menu', description: '🧭 Меню навигации' },
  { command: 'help', description: '❔ Краткая помощь' },
  { command: 'terms', description: '📄 Пользовательское соглашение' },
  { command: 'checkin', description: '🌤 Отметить состояние' },
  { command: 'event', description: '🗂 Добавить событие' },
  { command: 'history', description: '📚 Последние записи' },
  { command: 'stats', description: '📊 Сводка и графики' },
  { command: 'settings', description: '⚙️ Настройки' },
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
    toMenu: 'В меню',
    back: 'Назад',
    next: 'Далее',
    historyOpen: 'Открыть',
    historyBackToList: 'К списку',
    skip: 'Пропустить',
    firstCheckinStart: 'Начать check-in',
    later: 'Позже',
    reminderLater: 'Настрою позже',
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
    menuStats: '📊 Статистика',
    menuHistory: '📚 История',
    menuSettings: '⚙️ Настройки',
    menuHelp: '❔ Помощь',
    menuTerms: '📄 Соглашение',
  },
  startup: {
    alreadyReady: '<b>👋 Ты уже в emoTrack</b>\n━━━━━━━━━━━━\nОткрываю меню. Выбери нужный раздел ниже.',
    unknownInput: 'Не понял сообщение. Выбери действие из меню или используй команду.',
  },
  placeholders: {
    help: 'Справка временно недоступна.',
  },
  common: {
    cancelled: 'Действие отменено.',
    cancelledToMenu: '<b>🧭 Действие остановлено</b>\n━━━━━━━━━━━━\nВернул тебя в меню. Можно выбрать следующий раздел ниже.',
    backUnavailable: 'Назад на этом шаге недоступно.',
    actionNotAllowed: 'Это действие сейчас недоступно. Продолжим текущий шаг.',
    updated: 'Сохранено.',
    unexpectedError: 'Что-то пошло не так. Попробуй еще раз.',
  },
  onboarding: {
    intro: [
      '<b>👋 Привет! Это emoTrack</b>',
      '━━━━━━━━━━━━',
      'Я помогу быстро отмечать состояние, сон и события дня, а потом показывать историю, статистику и графики.',
      '',
      '<b>Как здесь устроены записи:</b>',
      '• <b>check-in</b> — короткая отметка состояния за день',
      '• <b>заметка</b> — свободный контекст к check-in, например: <i>«плохо спал, много созвонов, вечером стало легче»</i>',
      '• <b>событие</b> — отдельный факт дня с категорией и оценкой, например работа, спорт, сон или встреча',
      '',
      '<b>Первый маршрут займет около минуты:</b>',
      '• примем соглашение',
      '• предложу ежедневное напоминание',
      '• сразу сможешь отметить состояние за сегодня',
    ].join('\n'),
    disclaimer: '<i>Это инструмент самонаблюдения. Он не заменяет специалиста и не ставит диагнозы.</i>',
    consentPrompt:
      '<b>📄 Перед стартом</b>\nЧтобы сохранять записи, нужно принять пользовательское соглашение. Перед согласием можно открыть /terms.',
    consentAccepted: '✅ Соглашение принято.',
    consentDeclined: 'Без принятия соглашения бот не может сохранять записи.',
    reminderPrompt: [
      '<b>⏰ Ежедневное напоминание</b>',
      '━━━━━━━━━━━━',
      'Могу каждый день мягко напоминать про check-in.',
      '',
      'Отправь время в формате <b>HH:mm</b>, например <b>21:30</b>.',
      '<i>Если не хочешь настраивать сейчас, нажми «Настрою позже».</i>',
    ].join('\n'),
    reminderSaved: '✅ Напоминание сохранено.',
    reminderSkipped: 'Напоминание можно включить позже в /settings.',
    completed: '✅ Базовая настройка завершена.',
    firstCheckinOffer: [
      '<b>🌤 Готово. Давай попробуем главное</b>',
      '━━━━━━━━━━━━',
      'Лучше всего начать с первой отметки состояния за сегодня. Это займет меньше минуты.',
      '',
      '<i>После оценок можно добавить заметку: что могло повлиять на состояние и что важно вспомнить позже.</i>',
    ].join('\n'),
    firstCheckinDeferred: [
      '<b>🧭 Главное меню готово</b>',
      '━━━━━━━━━━━━',
      'Когда будешь готов, нажми <b>Отметить состояние</b> или запусти /checkin.',
      '',
      '<b>Что будет полезно дальше:</b>',
      '• история покажет, как меняется состояние по дням',
      '• статистика поможет увидеть тенденции',
      '• заметки сохранят живой контекст дня рядом с check-in',
      '• события помогут отдельно отметить важные факты и увидеть, как они связаны с состоянием',
      '• напоминания можно включить или изменить в /settings',
    ].join('\n'),
    firstCheckinIntro: '<b>Отлично, начнем с первой отметки.</b>\nПосле нее покажу главное меню.',
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
  menu: {
    text: [
      '<b>🧭 Меню emoTrack</b>',
      '━━━━━━━━━━━━',
      'Нижняя клавиатура оставлена для быстрых действий:',
      '• <b>Отметить состояние</b>',
      '• <b>Добавить событие</b>',
      '',
      '<i>Остальные разделы открываются кнопками ниже или slash-командами.</i>',
    ].join('\n'),
  },
  checkin: {
    started: '<b>🌤 Check-in за сегодня</b>\n━━━━━━━━━━━━\nОтметим состояние короткими шагами.',
    resumed: '<b>↩️ Продолжим текущий check-in</b>\n━━━━━━━━━━━━\nВернемся к последнему незавершенному шагу.',
    interrupted: 'Текущий check-in сбился. Начни заново командой /checkin.',
    notePrompt: [
      '<b>📝 Заметка к check-in</b>',
      '━━━━━━━━━━━━',
      'Заметка — это свободный контекст именно к сегодняшнему состоянию.',
      '<i>Пример: «плохо спал, днем был перегруз, прогулка помогла».</i>',
    ].join('\n'),
    noteInputPrompt: [
      '<b>📝 Текст заметки</b>',
      '━━━━━━━━━━━━',
      'Отправь заметку одним сообщением.',
      '<i>Пиши коротко и по делу: что могло повлиять на оценки сегодня.</i>',
    ].join('\n'),
    tagsPrompt: '<b>🏷 Теги состояния</b>\n━━━━━━━━━━━━\nМожно отметить несколько тегов, чтобы потом легче читать историю.',
    tagsSelectionPrompt: 'Выбери один или несколько тегов и нажми «Готово».',
    tagsSaved: 'Теги сохранены.',
    noActiveTags: 'Сейчас нет активных тегов. Пропускаем этот шаг.',
    addEventPrompt: [
      '<b>🗂 Событие дня</b>',
      '━━━━━━━━━━━━',
      'Событие — это отдельный факт дня с категорией и оценкой.',
      '<i>Заметка объясняет состояние, событие фиксирует конкретный контекст: работа, спорт, встреча, сон, здоровье.</i>',
    ].join('\n'),
    repeatedStepPrompt: 'Продолжим текущий шаг.',
  },
  event: {
    startedStandalone:
      '<b>🗂 Новое событие</b>\n━━━━━━━━━━━━\nСобытие — отдельный факт дня: работа, спорт, встреча, сон или здоровье. Добавим категорию и оценку, чтобы позже видеть связь с состоянием.',
    typePrompt: '<b>🗂 Тип события</b>\n━━━━━━━━━━━━\nВыбери категорию кнопкой ниже.',
    titlePrompt: '<b>✍️ Название события</b>\n━━━━━━━━━━━━\nУкажи короткое название одним сообщением.',
    scorePrompt: '<b>🔢 Оценка события</b>\n━━━━━━━━━━━━\nОцени от <b>0</b> до <b>10</b>, где 0 = ужасно, 10 = прекрасно.',
    descriptionPrompt:
      '<b>📝 Описание события</b>\n━━━━━━━━━━━━\nМожно добавить детали именно об этом событии или нажать «Далее».',
    endDatePrompt:
      '<b>📅 Длительность</b>\n━━━━━━━━━━━━\nЕсли событие длилось несколько дней, отправь дату окончания в формате YYYY-MM-DD. Для однодневного события нажми «Далее».',
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
    periodPrompt: '<b>📊 Статистика</b>\n━━━━━━━━━━━━\nВыбери период для сводки.',
    metricPromptPrefix: '📊 Выбери метрику для периода',
    metricPromptHint:
      'В боте доступна краткая статистика по одной метрике за раз. Расширенная аналитика появится позже в веб-панели.',
    metricUnavailable: 'Эта метрика сейчас недоступна. Выбери метрику заново.',
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
      '<b>❔ Помощь emoTrack</b>',
      '━━━━━━━━━━━━',
      'emoTrack помогает отслеживать состояние, сон и события по дням.',
      '',
      '<b>Основная навигация</b>',
      '/menu — разделы и быстрые ссылки',
      '/checkin — отметить состояние',
      '/event — добавить событие',
      '',
      '<b>Разделы</b>',
      '/history — последние записи',
      '/stats — сводка и графики',
      '/settings — настройки',
      '/terms — пользовательское соглашение',
      '',
      '<b>Заметки и события</b>',
      'Заметка — короткое пояснение к check-in: что могло повлиять на состояние.',
      'Событие — отдельный факт дня с категорией и оценкой, чтобы потом искать связи.',
      '',
      '<i>Это не диагностика и не замена специалиста.</i>',
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

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

export function formatCheckinConfirmation(data: CheckinConfirmationData): string {
  const lines = [
    data.updated ? '✅ <b>Запись за сегодня обновлена</b>' : '✅ <b>Запись за сегодня сохранена</b>',
    '━━━━━━━━━━━━',
  ];
  const coreMetricsLine = formatCheckinCoreMetrics(data);
  const extraMetricsLine = formatCheckinExtraMetrics(data);
  const sleepLine = formatCheckinSleep(data);

  if (coreMetricsLine) {
    lines.push(coreMetricsLine);
  }

  if (extraMetricsLine) {
    lines.push(extraMetricsLine);
  }

  if (sleepLine) {
    lines.push(sleepLine);
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
    lines.push(`➕ Добавлено: ${extras.join(', ')}`);
  }

  return lines.join('\n');
}

function formatCheckinCoreMetrics(data: CheckinConfirmationData): string | null {
  const parts: string[] = [];

  if (typeof data.moodScore === 'number') {
    parts.push(`настроение ${data.moodScore}`);
  }

  if (typeof data.energyScore === 'number') {
    parts.push(`энергия ${data.energyScore}`);
  }

  if (typeof data.stressScore === 'number') {
    parts.push(`стресс ${data.stressScore}`);
  }

  return parts.length > 0 ? `🌡 Состояние: ${parts.join(', ')}` : null;
}

function formatCheckinExtraMetrics(data: CheckinConfirmationData): string | null {
  if (!data.extraMetricScores || data.extraMetricScores.length === 0) {
    return null;
  }

  const summary = data.extraMetricScores
    .map((metric) => `${escapeHtml(metric.label)} ${metric.value}`)
    .join(', ');
  return `🧩 Доп. метрики: ${summary}`;
}

function formatCheckinSleep(data: CheckinConfirmationData): string | null {
  if (typeof data.sleepHours === 'number' && typeof data.sleepQuality === 'number') {
    return `😴 Сон: ${data.sleepHours} ч, качество ${data.sleepQuality}`;
  }

  if (typeof data.sleepHours === 'number') {
    return `😴 Сон: ${data.sleepHours} ч`;
  }

  if (typeof data.sleepQuality === 'number') {
    return `😴 Качество сна: ${data.sleepQuality}`;
  }

  return null;
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
      return `<b>🌤 Шаг ${stepNumber}/${totalSteps} · Настроение</b>\n━━━━━━━━━━━━\nОцени <b>настроение</b>: <b>0..10</b>\n<i>0 — очень плохо, 10 — отлично.</i>`;
    case 'checkin_energy':
      return `<b>⚡ Шаг ${stepNumber}/${totalSteps} · Энергия</b>\n━━━━━━━━━━━━\nОцени <b>энергию</b>: <b>0..10</b>\n<i>0 — нет сил, 10 — очень много энергии.</i>`;
    case 'checkin_stress':
      return `<b>🧯 Шаг ${stepNumber}/${totalSteps} · Стресс</b>\n━━━━━━━━━━━━\nОцени <b>стресс</b>: <b>0..10</b>\n<i>0 — спокойно, 10 — очень напряженно.</i>`;
    case 'checkin_sleep_hours':
      return `<b>😴 Шаг ${stepNumber}/${totalSteps} · Часы сна</b>\n━━━━━━━━━━━━\nСколько <b>часов сна</b> было?\n<i>Можно число от 0 до 24, например 7.5.</i>`;
    case 'checkin_sleep_quality':
      return `<b>🌙 Шаг ${stepNumber}/${totalSteps} · Качество сна</b>\n━━━━━━━━━━━━\nОцени <b>качество сна</b>: <b>0..10</b>\n<i>0 — сон совсем не восстановил, 10 — отлично восстановил.</i>`;
  }
}

export function getExtraMetricCheckinPrompt(label: string, stepNumber: number, totalSteps: number): string {
  const safeLabel = escapeHtml(label);
  return `<b>🧩 Шаг ${stepNumber}/${totalSteps} · ${safeLabel}</b>\n━━━━━━━━━━━━\nОцени <b>${safeLabel.toLowerCase()}</b>: <b>0..10</b>`;
}

export function formatCheckinTagsSelectionPrompt(selectedCount: number): string {
  const selectedLine =
    selectedCount > 0
      ? `Выбрано: <b>${formatTagsCount(selectedCount)}</b>`
      : 'Выбрано: <i>пока ничего</i>';

  return [
    '<b>🏷 Теги состояния</b>',
    '━━━━━━━━━━━━',
    selectedLine,
    '<i>Можно выбрать несколько тегов. Готово сохранит выбор.</i>',
  ].join('\n');
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
    `<b>${telegramCopy.settings.title}</b>`,
    '━━━━━━━━━━━━',
    `<b>${telegramCopy.settings.remindersSectionTitle}</b>`,
    `• ${data.remindersEnabled ? telegramCopy.settings.remindersEnabled : telegramCopy.settings.remindersDisabled}`,
    `• ${formatReminderRuntimeLine(data)}`,
    `• ${telegramCopy.settings.reminderTimeLabel}: ${escapeHtml(data.reminderTime ?? '—')}`,
    `• ${telegramCopy.settings.weeklyDigestLabel}: ${formatWeeklyDigestRuntimeLine(data)}`,
    '',
    `<b>${telegramCopy.settings.checkinSectionTitle}</b>`,
    `• ${telegramCopy.settings.sleepModeLabel}: ${SLEEP_MODE_LABELS[data.sleepMode]}`,
    `• ${telegramCopy.settings.dailyTrackingLabel}: ${escapeHtml(formatTrackedMetricsSummary(data))}`,
  ];

  return lines.join('\n');
}

export function formatDailyMetricsSettingsText(metrics: SettingsMetricOptionData[]): string {
  const activeMetrics = metrics
    .filter((metric) => metric.enabled)
    .map((metric) => escapeHtml(metric.label.toLowerCase()));
  const lines = [
    `<b>${telegramCopy.settings.dailyMetricsTitle}</b>`,
    '━━━━━━━━━━━━',
    `<i>${telegramCopy.settings.dailyMetricsHint}</i>`,
    '',
    `${telegramCopy.settings.dailyMetricsActiveLabel}: ${activeMetrics.length > 0 ? activeMetrics.join(', ') : '—'}`,
    '',
  ];

  for (const metric of metrics) {
    lines.push(`• ${escapeHtml(metric.label)}: ${metric.enabled ? 'вкл' : 'выкл'}`);
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
    const lines = [`📅 <b>${formatHistoryDate(entry.entryDate)}</b>`];
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

  return `<b>${options.title ?? telegramCopy.history.title}</b>\n━━━━━━━━━━━━\n\n${items.join('\n\n')}`;
}

export function formatHistoryEntryDetail(entry: HistoryEntryDetailData): string {
  const lines = [
    `<b>${telegramCopy.history.detailTitlePrefix} ${formatHistoryDate(entry.entryDate)}</b>`,
    '━━━━━━━━━━━━',
  ];
  const coreMetricsLine = formatHistoryCoreMetrics(entry);
  const extraMetricsLine = formatHistoryExtraMetrics(entry);
  const sleepLine = formatHistorySleep(entry);

  if (coreMetricsLine) {
    lines.push('', '<b>🌤 Состояние</b>', coreMetricsLine);
  } else if (extraMetricsLine) {
    lines.push('', '<b>🌤 Состояние</b>', extraMetricsLine);
  }

  if (sleepLine) {
    lines.push('', '<b>😴 Сон</b>', formatHistorySleepValue(entry));
  }

  if (coreMetricsLine && extraMetricsLine) {
    lines.push(extraMetricsLine);
  }

  if (entry.noteText?.trim()) {
    lines.push('', '<b>📝 Заметка</b>');
    lines.push(escapeHtml(entry.noteText.trim()));
  }

  if (entry.tags && entry.tags.length > 0) {
    lines.push('', '<b>🏷 Теги</b>');
    lines.push(...entry.tags.map((tag) => `• ${escapeHtml(tag.label)}`));
  }

  if (entry.events && entry.events.length > 0) {
    lines.push('', '<b>🗂 События</b>');

    for (const event of entry.events) {
      const eventTypeLabel = EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;
      const eventRange = formatHistoryEventRange(event.eventDate, event.eventEndDate ?? null);
      const summaryParts = [`${eventTypeLabel}: <b>${escapeHtml(event.title)}</b>`, `оценка ${event.eventScore}`];

      if (eventRange) {
        summaryParts.push(eventRange);
      }

      lines.push(`• ${summaryParts.join(' · ')}`);

      if (event.description?.trim()) {
        lines.push(`  <i>${escapeHtml(event.description.trim())}</i>`);
      }
    }
  }

  return lines.join('\n');
}

function formatMetricOrDashBold(value: number | null): string {
  return typeof value === 'number' ? `<b>${value}</b>` : '—';
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

  return [
    `настроение ${formatMetricOrDashBold(entry.moodScore)}`,
    `энергия ${formatMetricOrDashBold(entry.energyScore)}`,
    `стресс ${formatMetricOrDashBold(entry.stressScore)}`,
  ].join(' · ');
}

function formatHistoryDate(entryDate: Date): string {
  const [year, month, day] = formatDateKey(entryDate).split('-');
  return `${day}.${month}.${year}`;
}

function formatHistorySleep(
  entry: Pick<HistoryEntryData, 'sleepHours' | 'sleepQuality'>,
): string | null {
  if (typeof entry.sleepHours === 'number' && typeof entry.sleepQuality === 'number') {
    return `😴 <b>Сон</b>: ${entry.sleepHours} ч · качество ${entry.sleepQuality}`;
  }

  if (typeof entry.sleepHours === 'number') {
    return `😴 <b>Сон</b>: ${entry.sleepHours} ч`;
  }

  if (typeof entry.sleepQuality === 'number') {
    return `😴 <b>Качество сна</b>: ${entry.sleepQuality}`;
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
    .map((metric) => `${escapeHtml(metric.label)} <b>${metric.value}</b>`)
    .join(', ');

  return `🧩 <b>Доп. метрики</b>: ${summary}`;
}

function formatHistoryEntrySummary(hasNote: boolean, tagsCount: number, eventsCount: number): string {
  const markers: string[] = [];

  if (hasNote) {
    markers.push('📝 заметка');
  }

  if (tagsCount > 0) {
    markers.push(`🏷 ${formatTagsCount(tagsCount)}`);
  }

  markers.push(`🗂 ${formatEventsCount(eventsCount)}`);

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
    '<b>📊 Метрика статистики</b>',
    '━━━━━━━━━━━━',
    `${telegramCopy.stats.metricPromptPrefix}: ${STATS_PERIOD_LABELS[periodType]}.`,
    `<i>${telegramCopy.stats.metricPromptHint}</i>`,
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


