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

export const TEXT_LIMITS = {
  note: 800,
  eventTitle: 120,
  eventDescription: 500,
} as const;

export const TELEGRAM_CALLBACKS = {
  consentAccept: 'onboarding:consent:accept',
  onboardingStartFirstCheckin: 'onboarding:first-checkin:start',
  onboardingLater: 'onboarding:first-checkin:later',

  historyMorePrefix: 'history:more:',

  scorePrefix: 'checkin:score:',
  checkinNoteAdd: 'checkin:note:add',
  checkinTagsStart: 'checkin:tags:start',
  checkinTagsDone: 'checkin:tags:done',
  checkinTagsTogglePrefix: 'checkin:tags:toggle:',
  checkinEventAdd: 'checkin:event:add',

  eventTypePrefix: 'event:type:',
  eventRepeatModePrefix: 'event:repeat-mode:',
  eventRepeatCountPrefix: 'event:repeat-count:',
  statsPeriodPrefix: 'stats:period:',
  settingsRemindersToggle: 'settings:reminders:toggle',
  settingsReminderTimeEdit: 'settings:reminder-time:edit',
  settingsSleepModeSelect: 'settings:sleep-mode:select',
  settingsSleepModePrefix: 'settings:sleep-mode:',

  actionCancel: 'action:cancel',
  actionBack: 'action:back',
  actionSkip: 'action:skip',
} as const;
