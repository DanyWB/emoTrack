import type { PredefinedTag } from '@prisma/client';
import { Markup } from 'telegraf';

import { TELEGRAM_CALLBACKS, TELEGRAM_MAIN_MENU_BUTTONS } from '../common/constants/app.constants';
import {
  EVENT_TYPE_LABELS,
  SLEEP_MODE_LABELS,
  getSettingsToggleButtonLabel,
  telegramCopy,
} from './telegram.copy';

type CallbackButton = ReturnType<typeof Markup.button.callback>;

function scoreRows(): CallbackButton[][] {
  return [
    [0, 1, 2, 3].map((score) => Markup.button.callback(String(score), `${TELEGRAM_CALLBACKS.scorePrefix}${score}`)),
    [4, 5, 6, 7].map((score) => Markup.button.callback(String(score), `${TELEGRAM_CALLBACKS.scorePrefix}${score}`)),
    [8, 9, 10].map((score) => Markup.button.callback(String(score), `${TELEGRAM_CALLBACKS.scorePrefix}${score}`)),
  ];
}

function actionRow(options: { back?: boolean; skip?: boolean }): CallbackButton[] {
  const row: CallbackButton[] = [];

  if (options.back) {
    row.push(Markup.button.callback(telegramCopy.buttons.back, TELEGRAM_CALLBACKS.actionBack));
  }

  if (options.skip) {
    row.push(Markup.button.callback(telegramCopy.buttons.skip, TELEGRAM_CALLBACKS.actionSkip));
  }

  row.push(Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel));
  return row;
}

function chunkButtons(buttons: CallbackButton[], size: number): CallbackButton[][] {
  const rows: CallbackButton[][] = [];

  for (let index = 0; index < buttons.length; index += size) {
    rows.push(buttons.slice(index, index + size));
  }

  return rows;
}

function eventTypeButtons(): CallbackButton[][] {
  const buttons = Object.entries(EVENT_TYPE_LABELS).map(([type, label]) =>
    Markup.button.callback(label, `${TELEGRAM_CALLBACKS.eventTypePrefix}${type}`),
  );

  return chunkButtons(buttons, 2);
}

export const telegramKeyboards = {
  mainMenu: () =>
    Markup.keyboard([
      [TELEGRAM_MAIN_MENU_BUTTONS[0], TELEGRAM_MAIN_MENU_BUTTONS[1]],
      [TELEGRAM_MAIN_MENU_BUTTONS[2], TELEGRAM_MAIN_MENU_BUTTONS[3]],
      [TELEGRAM_MAIN_MENU_BUTTONS[4], TELEGRAM_MAIN_MENU_BUTTONS[5]],
    ])
      .resize()
      .persistent(),

  consent: () =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback(telegramCopy.buttons.consentAccept, TELEGRAM_CALLBACKS.consentAccept),
        Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel),
      ],
    ]),

  onboardingFirstCheckin: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.firstCheckinStart, TELEGRAM_CALLBACKS.onboardingStartFirstCheckin)],
      [Markup.button.callback(telegramCopy.buttons.later, TELEGRAM_CALLBACKS.onboardingLater)],
    ]),

  scorePicker: (options: { back?: boolean; skip?: boolean } = {}) =>
    Markup.inlineKeyboard([...scoreRows(), actionRow(options)]),

  cancelOnly: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel)],
    ]),

  sleepHoursActions: (options: { back?: boolean } = {}) =>
    Markup.inlineKeyboard([actionRow({ back: options.back, skip: true })]),

  sleepQualityActions: (options: { back?: boolean } = {}) =>
    Markup.inlineKeyboard([...scoreRows(), actionRow({ back: options.back, skip: true })]),

  checkinNotePrompt: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.addNote, TELEGRAM_CALLBACKS.checkinNoteAdd)],
      actionRow({ back: true, skip: true }),
    ]),

  checkinTagsPrompt: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.chooseTags, TELEGRAM_CALLBACKS.checkinTagsStart)],
      actionRow({ back: true, skip: true }),
    ]),

  checkinTagsSelection: (tags: PredefinedTag[], selectedTagIds: string[]) => {
    const selected = new Set(selectedTagIds);
    const tagButtons = tags.map((tag) => {
      const selectedMarker = selected.has(tag.id) ? '✅ ' : '';
      return Markup.button.callback(
        `${selectedMarker}${tag.label}`,
        `${TELEGRAM_CALLBACKS.checkinTagsTogglePrefix}${tag.id}`,
      );
    });

    return Markup.inlineKeyboard([
      ...chunkButtons(tagButtons, 2),
      [Markup.button.callback(telegramCopy.buttons.tagsDone, TELEGRAM_CALLBACKS.checkinTagsDone)],
      actionRow({ back: true, skip: true }),
    ]);
  },

  checkinAddEventPrompt: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.addEvent, TELEGRAM_CALLBACKS.checkinEventAdd)],
      actionRow({ back: true, skip: true }),
    ]),

  historyPage: (nextCursor?: string) =>
    nextCursor
      ? Markup.inlineKeyboard([
          [Markup.button.callback(telegramCopy.buttons.historyMore, `${TELEGRAM_CALLBACKS.historyMorePrefix}${nextCursor}`)],
        ])
      : undefined,

  eventTypePicker: (options: { back?: boolean } = {}) =>
    Markup.inlineKeyboard([...eventTypeButtons(), actionRow({ back: options.back })]),

  eventTitleActions: (options: { back?: boolean } = {}) =>
    Markup.inlineKeyboard([actionRow({ back: options.back })]),

  eventDescriptionActions: (options: { back?: boolean } = {}) =>
    Markup.inlineKeyboard([actionRow({ back: options.back, skip: true })]),

  statsPeriodSelector: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.stats7d, `${TELEGRAM_CALLBACKS.statsPeriodPrefix}d7`)],
      [Markup.button.callback(telegramCopy.buttons.stats30d, `${TELEGRAM_CALLBACKS.statsPeriodPrefix}d30`)],
      [Markup.button.callback(telegramCopy.buttons.statsAll, `${TELEGRAM_CALLBACKS.statsPeriodPrefix}all`)],
      [Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel)],
    ]),

  settingsMenu: (remindersEnabled: boolean) =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback(getSettingsToggleButtonLabel(remindersEnabled), TELEGRAM_CALLBACKS.settingsRemindersToggle),
      ],
      [Markup.button.callback(telegramCopy.buttons.settingsEditReminderTime, TELEGRAM_CALLBACKS.settingsReminderTimeEdit)],
      [Markup.button.callback(telegramCopy.buttons.settingsSleepMode, TELEGRAM_CALLBACKS.settingsSleepModeSelect)],
      [Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel)],
    ]),

  settingsSleepMode: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(SLEEP_MODE_LABELS.hours, `${TELEGRAM_CALLBACKS.settingsSleepModePrefix}hours`)],
      [Markup.button.callback(SLEEP_MODE_LABELS.quality, `${TELEGRAM_CALLBACKS.settingsSleepModePrefix}quality`)],
      [Markup.button.callback(SLEEP_MODE_LABELS.both, `${TELEGRAM_CALLBACKS.settingsSleepModePrefix}both`)],
      [Markup.button.callback(telegramCopy.buttons.back, TELEGRAM_CALLBACKS.actionBack)],
      [Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel)],
    ]),
};
