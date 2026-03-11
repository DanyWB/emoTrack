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
    stats7d: '7 дней',
    stats30d: '30 дней',
    statsAll: 'За всё время',
    settingsToggleReminders: 'Вкл/выкл напоминания',
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
    moodPrompt: 'Шаг 1/5. Оцени настроение: 0..10',
    energyPrompt: 'Шаг 2/5. Оцени энергию: 0..10',
    stressPrompt: 'Шаг 3/5. Оцени стресс: 0..10',
    sleepHoursPrompt: 'Шаг сна. Сколько часов спал? Можно число от 0 до 24, например 7.5',
    sleepQualityPrompt: 'Шаг сна. Оцени качество сна: 0..10',
    notePrompt: 'Если хочешь, можно добавить заметку за день.',
    noteInputPrompt: 'Отправь текст заметки одним сообщением.',
    tagsPrompt: 'Хочешь отметить теги состояния?',
    tagsSelectionPrompt: 'Выбери один или несколько тегов и нажми «Готово».',
    tagsSaved: 'Теги сохранены.',
    noActiveTags: 'Сейчас нет активных тегов. Пропускаем этот шаг.',
    addEventPrompt: 'Добавить событие за этот день?',
    eventLinked: 'Событие добавлено и связано с отметкой дня.',
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
    empty: 'Пока нет записей. Начни с /checkin.',
  },
  stats: {
    periodPrompt: 'Выбери период статистики.',
    loading: 'Собираю сводку…',
    empty: 'Недостаточно данных для сводки. Сделай несколько отметок и попробуй снова.',
    chartCombinedCaption: 'График настроения, энергии и стресса.',
    chartSleepCaption: 'График сна.',
    chartUnavailable: 'Сейчас не удалось построить графики. Текстовая сводка доступна.',
  },
  settings: {
    title: 'Настройки:',
    remindersEnabled: 'Напоминания: включены',
    remindersDisabled: 'Напоминания: выключены',
    reminderTimeLabel: 'Время напоминания',
    reminderTimePrompt: 'Введи новое время напоминания в формате HH:mm.',
    sleepModePrompt: 'Выбери режим сна.',
    reminderTimeUpdated: 'Время напоминания обновлено.',
    sleepModeUpdated: 'Режим сна обновлен.',
    remindersToggled: 'Настройка напоминаний обновлена.',
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

export function formatCheckinConfirmation(data: CheckinConfirmationData): string {
  const lines = [
    data.updated ? 'Запись за сегодня обновлена.' : 'Запись за сегодня сохранена.',
    `Настроение: ${data.moodScore}`,
    `Энергия: ${data.energyScore}`,
    `Стресс: ${data.stressScore}`,
  ];

  if (typeof data.sleepHours === 'number') {
    lines.push(`Сон (часы): ${data.sleepHours}`);
  }

  if (typeof data.sleepQuality === 'number') {
    lines.push(`Сон (качество): ${data.sleepQuality}`);
  }

  if (data.noteAdded) {
    lines.push('Заметка: добавлена');
  }

  if ((data.tagsCount ?? 0) > 0) {
    lines.push(`Теги: ${data.tagsCount}`);
  }

  if (data.eventAdded) {
    lines.push('Событие: добавлено');
  }

  return lines.join('\n');
}

export function formatHistoryEntries(entries: HistoryEntryData[]): string {
  if (entries.length === 0) {
    return telegramCopy.history.empty;
  }

  const items = entries.map((entry) => {
    const lines = [
      `• ${formatDateKey(entry.entryDate)}`,
      `Настроение/Энергия/Стресс: ${entry.moodScore}/${entry.energyScore}/${entry.stressScore}`,
    ];

    if (typeof entry.sleepHours === 'number') {
      lines.push(`Сон (часы): ${entry.sleepHours}`);
    }

    if (typeof entry.sleepQuality === 'number') {
      lines.push(`Сон (качество): ${entry.sleepQuality}`);
    }

    lines.push(`Заметка: ${entry.hasNote ? 'есть' : 'нет'}`);
    lines.push(`События: ${entry.eventsCount}`);

    return lines.join('\n');
  });

  return `${telegramCopy.history.title}\n\n${items.join('\n\n')}`;
}
