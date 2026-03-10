import { Markup } from 'telegraf';

import { TELEGRAM_CALLBACKS, TELEGRAM_MAIN_MENU_BUTTONS } from '../common/constants/app.constants';
import { telegramCopy } from './telegram.copy';

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
};
