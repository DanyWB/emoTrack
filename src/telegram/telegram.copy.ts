export const telegramCopy = {
  buttons: {
    consentAccept: 'Согласен',
    cancel: 'Отмена',
    back: 'Назад',
    skip: 'Пропустить',
    firstCheckinStart: 'Начать check-in',
    later: 'Позже',
  },
  startup: {
    alreadyReady: 'Профиль уже настроен. Можно отмечать состояние.',
    unknownInput: 'Не понял команду. Выбери действие из меню или используй /checkin.',
  },
  placeholders: {
    event: 'Добавление событий будет доступно на следующем этапе.',
    stats: 'Статистика будет доступна на следующем этапе.',
    history: 'История будет доступна на следующем этапе.',
    settings: 'Настройки будут доступны на следующем этапе.',
    help: 'emoTrack помогает отслеживать состояние и привычки. Это не диагностика и не замена специалиста.',
  },
  common: {
    cancelled: 'Действие отменено.',
    backUnavailable: 'Назад на этом шаге недоступно.',
    actionNotAllowed: 'Это действие сейчас недоступно. Продолжим текущий шаг.',
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
    repeatedStepPrompt: 'Продолжим текущий шаг.',
  },
  validation: {
    invalidTime: 'Некорректное время. Используй формат HH:mm, например 09:15.',
    invalidScore: 'Нужно целое число от 0 до 10.',
    invalidSleepHours: 'Нужно число от 0 до 24. Можно с дробной частью, например 7.5.',
  },
} as const;

export interface CheckinConfirmationData {
  moodScore: number;
  energyScore: number;
  stressScore: number;
  sleepHours?: number;
  sleepQuality?: number;
  updated: boolean;
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

  return lines.join('\n');
}
