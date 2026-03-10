export const APP_QUEUES = {
  reminders: 'reminders',
} as const;

export const TELEGRAM_MAIN_MENU_BUTTONS = [
  'Отметить состояние',
  'Добавить событие',
  'Моя статистика',
  'История',
  'Настройки',
  'Помощь',
] as const;

export const TELEGRAM_CALLBACKS = {
  consentAccept: 'onboarding:consent:accept',
  onboardingStartFirstCheckin: 'onboarding:first-checkin:start',
  onboardingLater: 'onboarding:first-checkin:later',
  scorePrefix: 'checkin:score:',
  actionCancel: 'action:cancel',
  actionBack: 'action:back',
  actionSkip: 'action:skip',
} as const;