export const APP_QUEUES = {
  reminders: 'reminders',
} as const;

export const TELEGRAM_MAIN_MENU_BUTTONS = [
  'Отметить состояние',
  'Добавить событие',
] as const;

export const TEXT_LIMITS = {
  note: 800,
  eventTitle: 120,
  eventDescription: 500,
} as const;

export const TELEGRAM_CALLBACKS = {
  consentAccept: 'onboarding:consent:accept',
  onboardingReminderLater: 'onboarding:reminder:later',
  onboardingStartFirstCheckin: 'onboarding:first-checkin:start',
  onboardingLater: 'onboarding:first-checkin:later',

  menuStats: 'menu:stats',
  menuHistory: 'menu:history',
  menuSettings: 'menu:settings',
  menuHelp: 'menu:help',
  menuTerms: 'menu:terms',

  adminMenu: 'admin:menu',
  adminOverview: 'admin:overview',
  adminActiveUsersPrefix: 'admin:active:',
  adminUserPrefix: 'admin:user:',
  adminUserStatsPrefix: 'admin:ustats:',
  adminUserHistoryPrefix: 'admin:uhist:',
  adminEntryOpenPrefix: 'admin:entry:',
  adminHistoryBackPrefix: 'admin:hback:',

  historyMorePrefix: 'history:more:',
  historyOpenPrefix: 'history:open:',
  historyBackPrefix: 'history:back:',

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
  statsMetricPrefix: 'stats:metric:',
  settingsRemindersToggle: 'settings:reminders:toggle',
  settingsReminderTimeEdit: 'settings:reminder-time:edit',
  settingsSleepModeSelect: 'settings:sleep-mode:select',
  settingsSleepModePrefix: 'settings:sleep-mode:',
  settingsDailyMetricsOpen: 'settings:daily-metrics:open',
  settingsDailyMetricTogglePrefix: 'settings:daily-metrics:toggle:',
  settingsTrackMoodToggle: 'settings:track:mood',
  settingsTrackEnergyToggle: 'settings:track:energy',
  settingsTrackStressToggle: 'settings:track:stress',
  settingsTrackSleepToggle: 'settings:track:sleep',

  actionCancel: 'action:cancel',
  actionBack: 'action:back',
  actionSkip: 'action:skip',
} as const;
