import type { EventType, SleepMode, SummaryPeriodType } from '@prisma/client';

import { formatDateKey } from '../common/utils/date.utils';

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
    consentAccept: 'Согласен',
    cancel: 'Отмена',
    back: 'Назад',
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
    sleepModeHours: 'Только часы',
    sleepModeQuality: 'Только качество',
    sleepModeBoth: 'Часы и качество',
  },
  startup: {
    alreadyReady: 'Профиль уже настроен. Можно отмечать состояние.',
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
    intro: 'Привет. emoTrack поможет фиксировать состояние по дням.',
    disclaimer: 'Это трекер самонаблюдения. Это не диагностика и не замена специалиста.',
    consentPrompt: 'Согласен на хранение записей в боте?',
    consentAccepted: 'Спасибо. Теперь укажи время напоминания в формате HH:mm.',
    consentDeclined: 'Без согласия мы не можем сохранять записи.',
    reminderPrompt: 'Введи время напоминания в формате HH:mm, например 21:30.',
    reminderSaved: 'Время напоминания сохранено.',
    completed: 'Онбординг завершен. Можно сделать первую отметку за сегодня.',
    firstCheckinOffer: 'Начать первый check-in сейчас?',
    firstCheckinDeferred: 'Хорошо. Запусти /checkin, когда будешь готов.',
    incompleteRedirect: 'Сначала заверши онбординг. Продолжим с текущего шага.',
  },
  checkin: {
    started: 'Отметь состояние за сегодня.',
    resumed: 'Продолжим текущий check-in.',
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
    startedStandalone: 'Добавим событие.',
    typePrompt: 'Выбери тип события.',
    titlePrompt: 'Укажи короткое название события.',
    scorePrompt: 'Оцени событие от 0 до 10, где 0 = ужасно, 10 = прекрасно.',
    descriptionPrompt: 'Можно добавить описание одним сообщением или нажать «Пропустить».',
    savedStandalone: 'Событие сохранено.',
  },
  history: {
    title: 'Последние записи:',
    moreTitle: 'Еще записи:',
    empty: 'Пока нет записей. Начни с /checkin.',
    stale: 'Этот список уже неактуален. Открой /history снова.',
  },
  stats: {
    periodPrompt: 'Выбери период статистики.',
    loading: 'Собираю сводку…',
    empty: 'Недостаточно данных для сводки. Сделай несколько отметок и попробуй снова.',
    titlePrefix: 'Сводка за период',
    countsLabel: 'Кратко',
    averagesLabel: 'Средние значения',
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
    chartSleepCaption: 'График сна.',
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
    title: 'Настройки:',
    remindersEnabled: 'Напоминания: включены',
    remindersDisabled: 'Напоминания: выключены',
    remindersRuntimeLabel: 'Автонапоминания',
    remindersRuntimeActive: 'Автонапоминания: активны',
    remindersRuntimeDisabled: 'Автонапоминания: выключены',
    remindersRuntimeUnavailable: 'Автонапоминания: недоступны в этой среде',
    reminderTimeLabel: 'Время напоминания',
    sleepModeLabel: 'Режим сна',
    reminderTimePrompt: 'Введи новое время напоминания в формате HH:mm.',
    sleepModePrompt: 'Выбери режим сна.',
    reminderTimeUpdated: 'Время напоминания обновлено.',
    reminderTimeSavedWithoutDelivery:
      'Время напоминания сохранено. В этой среде автонапоминания сейчас не отправляются.',
    sleepModeUpdated: 'Режим сна обновлен.',
    remindersEnabledUpdated: 'Напоминания включены.',
    remindersEnabledWithoutDelivery:
      'Напоминания включены в настройках. В этой среде автонапоминания сейчас не отправляются.',
    remindersDisabledUpdated: 'Напоминания выключены.',
  },
  reminders: {
    dailyPrompt: 'Напоминание: отметь состояние за сегодня командой /checkin.',
  },
  help: {
    text: [
      'emoTrack помогает отслеживать состояние, сон и события по дням.',
      '',
      'Команды:',
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
  },
} as const;

export interface CheckinConfirmationData {
  moodScore: number;
  energyScore: number;
  stressScore: number;
  sleepHours?: number;
  sleepQuality?: number;
  updated: boolean;
  noteAdded?: boolean;
  tagsCount?: number;
  eventAdded?: boolean;
}

export interface HistoryEntryData {
  entryDate: Date;
  moodScore: number;
  energyScore: number;
  stressScore: number;
  sleepHours?: number;
  sleepQuality?: number;
  hasNote: boolean;
  eventsCount: number;
}

interface HistoryEntriesFormatOptions {
  title?: string;
}

export interface SettingsViewData {
  remindersEnabled: boolean;
  reminderTime?: string | null;
  sleepMode: SleepMode;
  backgroundDeliveryAvailable: boolean;
}

export function formatCheckinConfirmation(data: CheckinConfirmationData): string {
  const lines = [
    data.updated ? 'Готово. Запись за сегодня обновлена.' : 'Готово. Запись за сегодня сохранена.',
    `Настроение: ${data.moodScore}`,
    `Энергия: ${data.energyScore}`,
    `Стресс: ${data.stressScore}`,
  ];

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
  state: 'checkin_mood' | 'checkin_energy' | 'checkin_stress' | 'checkin_sleep_hours' | 'checkin_sleep_quality',
  sleepMode: SleepMode,
): string {
  const totalSteps = sleepMode === 'both' ? 5 : 4;

  switch (state) {
    case 'checkin_mood':
      return `Шаг 1/${totalSteps}. Оцени настроение: 0..10`;
    case 'checkin_energy':
      return `Шаг 2/${totalSteps}. Оцени энергию: 0..10`;
    case 'checkin_stress':
      return `Шаг 3/${totalSteps}. Оцени стресс: 0..10`;
    case 'checkin_sleep_hours':
      return `Шаг 4/${totalSteps}. Сколько часов спал? Можно число от 0 до 24, например 7.5`;
    case 'checkin_sleep_quality':
      return `Шаг ${sleepMode === 'both' ? 5 : 4}/${totalSteps}. Оцени качество сна: 0..10`;
  }
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
    data.remindersEnabled ? telegramCopy.settings.remindersEnabled : telegramCopy.settings.remindersDisabled,
    formatReminderRuntimeLine(data),
    `${telegramCopy.settings.reminderTimeLabel}: ${data.reminderTime ?? '—'}`,
    `${telegramCopy.settings.sleepModeLabel}: ${SLEEP_MODE_LABELS[data.sleepMode]}`,
  ];

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

export function formatHistoryEntries(
  entries: HistoryEntryData[],
  options: HistoryEntriesFormatOptions = {},
): string {
  if (entries.length === 0) {
    return telegramCopy.history.empty;
  }

  const items = entries.map((entry) => {
    const lines = [
      `• ${formatHistoryDate(entry.entryDate)}`,
      `Настр./Энерг./Стресс: ${entry.moodScore}/${entry.energyScore}/${entry.stressScore}`,
    ];

    const sleepLine = formatHistorySleep(entry);
    if (sleepLine) {
      lines.push(sleepLine);
    }

    lines.push(`Заметка: ${entry.hasNote ? 'есть' : '—'} · События: ${entry.eventsCount}`);

    return lines.join('\n');
  });

  return `${options.title ?? telegramCopy.history.title}\n\n${items.join('\n\n')}`;
}

function formatHistoryDate(entryDate: Date): string {
  const [year, month, day] = formatDateKey(entryDate).split('-');
  return `${day}.${month}.${year}`;
}

function formatHistorySleep(entry: HistoryEntryData): string | null {
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

function formatReminderRuntimeLine(data: SettingsViewData): string {
  if (!data.remindersEnabled) {
    return telegramCopy.settings.remindersRuntimeDisabled;
  }

  if (!data.backgroundDeliveryAvailable) {
    return telegramCopy.settings.remindersRuntimeUnavailable;
  }

  return telegramCopy.settings.remindersRuntimeActive;
}
