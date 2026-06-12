import type { PredefinedTag } from '@prisma/client';
import { Markup } from 'telegraf';

import { TELEGRAM_CALLBACKS, TELEGRAM_MAIN_MENU_BUTTONS } from '../common/constants/app.constants';
import {
  ANNOUNCEMENT_SENDING_RECOVERY_AFTER_MS,
  ANNOUNCEMENT_TYPES,
  type AnnouncementTypeKey,
} from '../announcements/announcements.types';
import type { CheckinV2ScaleOption, CheckinV2TagDefinition } from '../checkins/checkins-v2.catalog';
import { FEEDBACK_TYPES, type FeedbackTypeKey } from '../feedback/feedback.types';
import {
  EVENT_TYPE_LABELS,
  SLEEP_MODE_LABELS,
  formatAdminAnnouncementButtonLabel,
  formatAdminFeedbackButtonLabel,
  getSettingsMetricToggleButtonLabel,
  getSettingsToggleButtonLabel,
  TERMS_DOCUMENTS,
  telegramCopy,
  type AdminAnnouncementCampaignData,
  type AdminFeedbackItemData,
  type SettingsMetricOptionData,
  type TermsDocumentKey,
} from './telegram.copy';

type CallbackButton = ReturnType<typeof Markup.button.callback>;

function scoreRows(): CallbackButton[][] {
  return [
    [0, 1, 2, 3].map((score) => Markup.button.callback(String(score), `${TELEGRAM_CALLBACKS.scorePrefix}${score}`)),
    [4, 5, 6, 7].map((score) => Markup.button.callback(String(score), `${TELEGRAM_CALLBACKS.scorePrefix}${score}`)),
    [8, 9, 10].map((score) => Markup.button.callback(String(score), `${TELEGRAM_CALLBACKS.scorePrefix}${score}`)),
  ];
}

function actionRow(options: { back?: boolean; skip?: boolean; skipLabel?: string; cancel?: boolean }): CallbackButton[] {
  const row: CallbackButton[] = [];

  if (options.back) {
    row.push(Markup.button.callback(telegramCopy.buttons.back, TELEGRAM_CALLBACKS.actionBack));
  }

  if (options.skip) {
    row.push(Markup.button.callback(options.skipLabel ?? telegramCopy.buttons.skip, TELEGRAM_CALLBACKS.actionSkip));
  }

  if (options.cancel ?? !options.back) {
    row.push(Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel));
  }

  return row;
}

function chunkButtons(buttons: CallbackButton[], size: number): CallbackButton[][] {
  const rows: CallbackButton[][] = [];

  for (let index = 0; index < buttons.length; index += size) {
    rows.push(buttons.slice(index, index + size));
  }

  return rows;
}

function formatHistoryButtonDate(entryDate: Date): string {
  return entryDate.toISOString().slice(5, 10).split('-').reverse().join('.');
}

function eventTypeButtons(): CallbackButton[][] {
  const buttons = Object.entries(EVENT_TYPE_LABELS).map(([type, label]) =>
    Markup.button.callback(label, `${TELEGRAM_CALLBACKS.eventTypePrefix}${type}`),
  );

  return chunkButtons(buttons, 2);
}

function getFeedbackTypeButtonLabel(type: FeedbackTypeKey): string {
  switch (type) {
    case 'bug':
      return telegramCopy.buttons.feedbackBug;
    case 'idea':
      return telegramCopy.buttons.feedbackIdea;
    case 'question':
      return telegramCopy.buttons.feedbackQuestion;
    case 'review':
      return telegramCopy.buttons.feedbackReview;
    case 'other':
      return telegramCopy.buttons.feedbackOther;
  }
}

function getAnnouncementTypeButtonLabel(type: AnnouncementTypeKey): string {
  const definition = ANNOUNCEMENT_TYPES.find((item) => item.key === type);
  return definition ? `${definition.icon} ${definition.label}` : type;
}

function isAnnouncementResumeAvailable(campaign: AdminAnnouncementCampaignData): boolean {
  if (campaign.status !== 'sending') {
    return false;
  }

  if (!campaign.startedAt) {
    return true;
  }

  return campaign.startedAt.getTime() <= Date.now() - ANNOUNCEMENT_SENDING_RECOVERY_AFTER_MS;
}

const TERMS_DOCUMENT_KEYS = Object.keys(TERMS_DOCUMENTS) as TermsDocumentKey[];

export const telegramKeyboards = {
  mainMenu: () =>
    Markup.keyboard([
      [TELEGRAM_MAIN_MENU_BUTTONS[0], TELEGRAM_MAIN_MENU_BUTTONS[1]],
    ])
      .resize()
      .persistent(),

  navigationMenu: () =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback(telegramCopy.buttons.menuStats, TELEGRAM_CALLBACKS.menuStats),
        Markup.button.callback(telegramCopy.buttons.menuHistory, TELEGRAM_CALLBACKS.menuHistory),
      ],
      [
        Markup.button.callback(telegramCopy.buttons.menuSettings, TELEGRAM_CALLBACKS.menuSettings),
        Markup.button.callback(telegramCopy.buttons.menuFeedback, TELEGRAM_CALLBACKS.menuFeedback),
      ],
      [
        Markup.button.callback(telegramCopy.buttons.menuSupport, TELEGRAM_CALLBACKS.menuSupport),
        Markup.button.callback(telegramCopy.buttons.menuHelp, TELEGRAM_CALLBACKS.menuHelp),
      ],
      [Markup.button.callback(telegramCopy.buttons.menuTerms, TELEGRAM_CALLBACKS.menuTerms)],
    ]),

  activeFlowGuard: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.flowContinue, TELEGRAM_CALLBACKS.flowContinue)],
      [Markup.button.callback(telegramCopy.buttons.flowCancelToMenu, TELEGRAM_CALLBACKS.flowCancelToMenu)],
    ]),

  adminMenu: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.adminOverview, TELEGRAM_CALLBACKS.adminOverview)],
      [Markup.button.callback(telegramCopy.buttons.adminActiveUsers, `${TELEGRAM_CALLBACKS.adminActiveUsersPrefix}0`)],
      [Markup.button.callback(telegramCopy.buttons.adminFeedback, `${TELEGRAM_CALLBACKS.adminFeedbackPrefix}0`)],
      [Markup.button.callback(telegramCopy.buttons.adminAnnouncements, TELEGRAM_CALLBACKS.adminAnnouncementsMenu)],
    ]),

  adminOverview: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.adminActiveUsers, `${TELEGRAM_CALLBACKS.adminActiveUsersPrefix}0`)],
      [Markup.button.callback(telegramCopy.buttons.adminFeedback, `${TELEGRAM_CALLBACKS.adminFeedbackPrefix}0`)],
      [Markup.button.callback(telegramCopy.buttons.adminAnnouncements, TELEGRAM_CALLBACKS.adminAnnouncementsMenu)],
      [Markup.button.callback(telegramCopy.buttons.adminBackToPanel, TELEGRAM_CALLBACKS.adminMenu)],
    ]),

  adminFeedbackPage: (
    items: AdminFeedbackItemData[],
    options: { offset: number; limit: number; hasPrevious: boolean; hasNext: boolean },
  ) => {
    const rows: CallbackButton[][] = items.map((item) => [
      Markup.button.callback(
        formatAdminFeedbackButtonLabel(item),
        `${TELEGRAM_CALLBACKS.adminFeedbackOpenPrefix}${item.item.id}:${options.offset}`,
      ),
    ]);
    const paginationRow: CallbackButton[] = [];

    if (options.hasPrevious) {
      paginationRow.push(
        Markup.button.callback(
          telegramCopy.buttons.back,
          `${TELEGRAM_CALLBACKS.adminFeedbackPrefix}${Math.max(0, options.offset - options.limit)}`,
        ),
      );
    }

    if (options.hasNext) {
      paginationRow.push(
        Markup.button.callback(
          telegramCopy.buttons.historyMore,
          `${TELEGRAM_CALLBACKS.adminFeedbackPrefix}${options.offset + options.limit}`,
        ),
      );
    }

    if (paginationRow.length > 0) {
      rows.push(paginationRow);
    }

    rows.push([Markup.button.callback(telegramCopy.buttons.adminBackToPanel, TELEGRAM_CALLBACKS.adminMenu)]);
    return Markup.inlineKeyboard(rows);
  },

  adminFeedbackDetail: (item: AdminFeedbackItemData, pageOffset: number) => {
    const rows: CallbackButton[][] = [];

    if (item.item.status === 'unread') {
      rows.push([
        Markup.button.callback(
          telegramCopy.buttons.adminMarkFeedbackReviewed,
          `${TELEGRAM_CALLBACKS.adminFeedbackReviewPrefix}${item.item.id}:${pageOffset}`,
        ),
      ]);
    }

    rows.push([
      Markup.button.callback(
        telegramCopy.buttons.adminBackToFeedback,
        `${TELEGRAM_CALLBACKS.adminFeedbackPrefix}${pageOffset}`,
      ),
    ]);
    rows.push([Markup.button.callback(telegramCopy.buttons.adminBackToPanel, TELEGRAM_CALLBACKS.adminMenu)]);
    return Markup.inlineKeyboard(rows);
  },

  adminAnnouncementsMenu: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.adminAnnouncementCreate, TELEGRAM_CALLBACKS.adminAnnouncementCreate)],
      [Markup.button.callback(telegramCopy.buttons.adminAnnouncementList, `${TELEGRAM_CALLBACKS.adminAnnouncementListPrefix}0`)],
      [Markup.button.callback(telegramCopy.buttons.adminBackToPanel, TELEGRAM_CALLBACKS.adminMenu)],
    ]),

  adminAnnouncementTypePicker: () =>
    Markup.inlineKeyboard([
      ...chunkButtons(
        ANNOUNCEMENT_TYPES.map((type) =>
          Markup.button.callback(
            getAnnouncementTypeButtonLabel(type.key),
            `${TELEGRAM_CALLBACKS.adminAnnouncementTypePrefix}${type.key}`,
          ),
        ),
        1,
      ),
      [Markup.button.callback(telegramCopy.buttons.adminBackToAnnouncements, TELEGRAM_CALLBACKS.adminAnnouncementsMenu)],
    ]),

  adminAnnouncementTextActions: () =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback(`↩️ ${telegramCopy.buttons.back}`, TELEGRAM_CALLBACKS.actionBack),
        Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel),
      ],
    ]),

  adminAnnouncementImageActions: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.adminAnnouncementSkipImage, TELEGRAM_CALLBACKS.actionSkip)],
      [
        Markup.button.callback(`↩️ ${telegramCopy.buttons.back}`, TELEGRAM_CALLBACKS.actionBack),
        Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel),
      ],
    ]),

  adminAnnouncementPreview: (campaignId: string) =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.adminAnnouncementSend, `${TELEGRAM_CALLBACKS.adminAnnouncementSendPrefix}${campaignId}`)],
      [
        Markup.button.callback(telegramCopy.buttons.adminAnnouncementEditImage, TELEGRAM_CALLBACKS.actionBack),
        Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel),
      ],
    ]),

  adminAnnouncementsPage: (
    items: AdminAnnouncementCampaignData[],
    options: { offset: number; limit: number; hasPrevious: boolean; hasNext: boolean },
  ) => {
    const rows: CallbackButton[][] = items.map((item) => [
      Markup.button.callback(
        formatAdminAnnouncementButtonLabel(item),
        `${TELEGRAM_CALLBACKS.adminAnnouncementOpenPrefix}${item.id}:${options.offset}`,
      ),
    ]);
    const paginationRow: CallbackButton[] = [];

    if (options.hasPrevious) {
      paginationRow.push(
        Markup.button.callback(
          telegramCopy.buttons.back,
          `${TELEGRAM_CALLBACKS.adminAnnouncementListPrefix}${Math.max(0, options.offset - options.limit)}`,
        ),
      );
    }

    if (options.hasNext) {
      paginationRow.push(
        Markup.button.callback(
          telegramCopy.buttons.historyMore,
          `${TELEGRAM_CALLBACKS.adminAnnouncementListPrefix}${options.offset + options.limit}`,
        ),
      );
    }

    if (paginationRow.length > 0) {
      rows.push(paginationRow);
    }

    rows.push([Markup.button.callback(telegramCopy.buttons.adminBackToAnnouncements, TELEGRAM_CALLBACKS.adminAnnouncementsMenu)]);
    rows.push([Markup.button.callback(telegramCopy.buttons.adminBackToPanel, TELEGRAM_CALLBACKS.adminMenu)]);
    return Markup.inlineKeyboard(rows);
  },

  adminAnnouncementDetail: (campaign: AdminAnnouncementCampaignData, pageOffset: number) => {
    const rows: CallbackButton[][] = [];

    if (campaign.status === 'ready') {
      rows.push([
        Markup.button.callback(
          telegramCopy.buttons.adminAnnouncementSend,
          `${TELEGRAM_CALLBACKS.adminAnnouncementSendPrefix}${campaign.id}`,
        ),
      ]);
    }

    if (isAnnouncementResumeAvailable(campaign)) {
      rows.push([
        Markup.button.callback(
          telegramCopy.buttons.adminAnnouncementResume,
          `${TELEGRAM_CALLBACKS.adminAnnouncementSendPrefix}${campaign.id}`,
        ),
      ]);
    }

    rows.push([
        Markup.button.callback(
          telegramCopy.buttons.adminBackToAnnouncements,
          `${TELEGRAM_CALLBACKS.adminAnnouncementListPrefix}${pageOffset}`,
        ),
    ]);
    rows.push([Markup.button.callback(telegramCopy.buttons.adminBackToPanel, TELEGRAM_CALLBACKS.adminMenu)]);

    return Markup.inlineKeyboard(rows);
  },

  adminActiveUsers: (
    users: Array<{ userId: string; label: string }>,
    options: { offset: number; limit: number; hasPrevious: boolean; hasNext: boolean },
  ) => {
    const rows: CallbackButton[][] = users.map((user) => [
      Markup.button.callback(user.label, `${TELEGRAM_CALLBACKS.adminUserPrefix}${user.userId}`),
    ]);
    const paginationRow: CallbackButton[] = [];

    if (options.hasPrevious) {
      paginationRow.push(
        Markup.button.callback(
          telegramCopy.buttons.back,
          `${TELEGRAM_CALLBACKS.adminActiveUsersPrefix}${Math.max(0, options.offset - options.limit)}`,
        ),
      );
    }

    if (options.hasNext) {
      paginationRow.push(
        Markup.button.callback(
          telegramCopy.buttons.historyMore,
          `${TELEGRAM_CALLBACKS.adminActiveUsersPrefix}${options.offset + options.limit}`,
        ),
      );
    }

    if (paginationRow.length > 0) {
      rows.push(paginationRow);
    }

    rows.push([Markup.button.callback(telegramCopy.buttons.adminBackToPanel, TELEGRAM_CALLBACKS.adminMenu)]);

    return Markup.inlineKeyboard(rows);
  },

  adminUserDetail: (userId: string) =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          telegramCopy.buttons.adminUserStats7d,
          `${TELEGRAM_CALLBACKS.adminUserStatsPrefix}${userId}:d7`,
        ),
      ],
      [
        Markup.button.callback(
          telegramCopy.buttons.adminUserStats30d,
          `${TELEGRAM_CALLBACKS.adminUserStatsPrefix}${userId}:d30`,
        ),
      ],
      [
        Markup.button.callback(
          telegramCopy.buttons.adminUserStatsAll,
          `${TELEGRAM_CALLBACKS.adminUserStatsPrefix}${userId}:all`,
        ),
      ],
      [
        Markup.button.callback(
          telegramCopy.buttons.adminUserHistory,
          `${TELEGRAM_CALLBACKS.adminUserHistoryPrefix}${userId}:root`,
        ),
      ],
      [
        Markup.button.callback(telegramCopy.buttons.adminActiveUsers, `${TELEGRAM_CALLBACKS.adminActiveUsersPrefix}0`),
        Markup.button.callback(telegramCopy.buttons.adminBackToPanel, TELEGRAM_CALLBACKS.adminMenu),
      ],
    ]),

  adminHistoryPage: (
    entries: Array<{ id: string; entryDate: Date }>,
    userId: string,
    pageCursorToken: string,
    nextCursor?: string,
  ) => {
    const rows: CallbackButton[][] = entries.map((entry) => [
      Markup.button.callback(
        `${telegramCopy.buttons.historyOpen} ${formatHistoryButtonDate(entry.entryDate)}`,
        `${TELEGRAM_CALLBACKS.adminEntryOpenPrefix}${entry.id}:${pageCursorToken}`,
      ),
    ]);

    if (nextCursor) {
      rows.push([
        Markup.button.callback(
          telegramCopy.buttons.historyMore,
          `${TELEGRAM_CALLBACKS.adminUserHistoryPrefix}${userId}:${nextCursor}`,
        ),
      ]);
    }

    rows.push([Markup.button.callback(telegramCopy.buttons.adminBackToUser, `${TELEGRAM_CALLBACKS.adminUserPrefix}${userId}`)]);
    return Markup.inlineKeyboard(rows);
  },

  adminHistoryDetail: (userId: string, pageCursorToken: string) =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          telegramCopy.buttons.historyBackToList,
          `${TELEGRAM_CALLBACKS.adminHistoryBackPrefix}${userId}:${pageCursorToken}`,
        ),
      ],
      [Markup.button.callback(telegramCopy.buttons.adminBackToUser, `${TELEGRAM_CALLBACKS.adminUserPrefix}${userId}`)],
    ]),

  consent: () =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback(telegramCopy.buttons.consentAccept, TELEGRAM_CALLBACKS.consentAccept),
        Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel),
      ],
    ]),

  termsDocuments: (options: { showAccept: boolean; showMenu?: boolean }) => {
    const rows: CallbackButton[][] = TERMS_DOCUMENT_KEYS.map((key) => [
      Markup.button.callback(
        TERMS_DOCUMENTS[key].buttonLabel,
        `${TELEGRAM_CALLBACKS.termsDocumentPrefix}${key}`,
      ),
    ]);

    if (options.showAccept) {
      rows.push([
        Markup.button.callback(telegramCopy.buttons.consentAccept, TELEGRAM_CALLBACKS.consentAccept),
        Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel),
      ]);
    } else if (options.showMenu) {
      rows.push([Markup.button.callback(telegramCopy.buttons.toMenu, TELEGRAM_CALLBACKS.menuHome)]);
    }

    return Markup.inlineKeyboard(rows);
  },

  termsDocument: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.termsBackToDocuments, TELEGRAM_CALLBACKS.termsDocuments)],
    ]),

  onboardingFirstCheckin: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.firstCheckinStart, TELEGRAM_CALLBACKS.onboardingStartFirstCheckin)],
      [Markup.button.callback(telegramCopy.buttons.later, TELEGRAM_CALLBACKS.onboardingLater)],
    ]),

  onboardingReminderTime: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.reminderLater, TELEGRAM_CALLBACKS.onboardingReminderLater)],
      [Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel)],
    ]),

  scorePicker: (options: { back?: boolean; skip?: boolean } = {}) =>
    Markup.inlineKeyboard([...scoreRows(), actionRow(options)]),

  semanticScorePicker: (scale: CheckinV2ScaleOption[], options: { back?: boolean; skip?: boolean } = {}) =>
    Markup.inlineKeyboard([
      ...scale.map((option) => [
        Markup.button.callback(option.label, `${TELEGRAM_CALLBACKS.scorePrefix}${option.ordinalValue}`),
      ]),
      actionRow(options),
    ]),

  cancelOnly: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel)],
    ]),

  backOnly: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.back, TELEGRAM_CALLBACKS.actionBack)],
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

  checkinMetricTagsSelection: (tags: CheckinV2TagDefinition[], selectedTagKeys: string[]) => {
    const selected = new Set(selectedTagKeys);
    const tagButtons = tags.map((tag) => {
      const selectedMarker = selected.has(tag.key) ? '✅ ' : '';
      return Markup.button.callback(
        `${selectedMarker}${tag.label}`,
        `${TELEGRAM_CALLBACKS.checkinMetricTagsTogglePrefix}${tag.key}`,
      );
    });

    return Markup.inlineKeyboard([
      ...chunkButtons(tagButtons, 2),
      [Markup.button.callback(telegramCopy.buttons.tagsDone, TELEGRAM_CALLBACKS.checkinMetricTagsDone)],
      [
        Markup.button.callback(`↩️ ${telegramCopy.buttons.back}`, TELEGRAM_CALLBACKS.actionBack),
        Markup.button.callback(telegramCopy.buttons.addMetricTagsSkip, TELEGRAM_CALLBACKS.actionSkip),
      ],
    ]);
  },

  checkinConfirmationActions: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.toMenu, TELEGRAM_CALLBACKS.menuHome)],
    ]),

  supportActions: (supportUrl?: string) => {
    const rows: Array<Array<CallbackButton | ReturnType<typeof Markup.button.url>>> = [];

    if (supportUrl) {
      rows.push([Markup.button.url(telegramCopy.buttons.supportOpen, supportUrl)]);
    }

    rows.push([Markup.button.callback(telegramCopy.buttons.menuFeedback, TELEGRAM_CALLBACKS.menuFeedback)]);
    rows.push([Markup.button.callback(telegramCopy.buttons.toMenu, TELEGRAM_CALLBACKS.menuHome)]);
    return Markup.inlineKeyboard(rows);
  },

  feedbackTypePicker: () =>
    Markup.inlineKeyboard([
      ...chunkButtons(
        FEEDBACK_TYPES.map((type) =>
          Markup.button.callback(getFeedbackTypeButtonLabel(type.key), `${TELEGRAM_CALLBACKS.feedbackTypePrefix}${type.key}`),
        ),
        1,
      ),
      [Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel)],
    ]),

  feedbackMessageActions: () =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback(`↩️ ${telegramCopy.buttons.back}`, TELEGRAM_CALLBACKS.actionBack),
        Markup.button.callback(telegramCopy.buttons.cancel, TELEGRAM_CALLBACKS.actionCancel),
      ],
    ]),

  feedbackSaved: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.toMenu, TELEGRAM_CALLBACKS.menuHome)],
    ]),

  checkinReview: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.reviewContinue, TELEGRAM_CALLBACKS.checkinReviewConfirm)],
      [Markup.button.callback(telegramCopy.buttons.reviewEdit, TELEGRAM_CALLBACKS.checkinReviewEdit)],
      actionRow({ cancel: true }),
    ]),

  checkinReviewEdit: (items: Array<{ key: string; label: string }>) =>
    Markup.inlineKeyboard([
      ...chunkButtons(
        items.map((item) =>
          Markup.button.callback(item.label, `${TELEGRAM_CALLBACKS.checkinReviewEditPrefix}${item.key}`),
        ),
        2,
      ),
      [Markup.button.callback(telegramCopy.buttons.back, TELEGRAM_CALLBACKS.actionBack)],
    ]),

  checkinV2Onboarding: (isLast: boolean) =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isLast ? telegramCopy.buttons.firstCheckinStart : telegramCopy.buttons.next,
          isLast ? TELEGRAM_CALLBACKS.checkinV2OnboardingStart : TELEGRAM_CALLBACKS.checkinV2OnboardingNext,
        ),
      ],
    ]),

  checkinAddEventPrompt: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.addEvent, TELEGRAM_CALLBACKS.checkinEventAdd)],
      actionRow({ back: true, skip: true }),
    ]),

  historyPage: (entries: Array<{ id: string; entryDate: Date }>, pageCursorToken: string, nextCursor?: string) => {
    const rows: CallbackButton[][] = entries.map((entry) => [
      Markup.button.callback(
        `${telegramCopy.buttons.historyOpen} ${formatHistoryButtonDate(entry.entryDate)}`,
        `${TELEGRAM_CALLBACKS.historyOpenPrefix}${entry.id}:${pageCursorToken}`,
      ),
    ]);

    if (nextCursor) {
      rows.push([
        Markup.button.callback(telegramCopy.buttons.historyMore, `${TELEGRAM_CALLBACKS.historyMorePrefix}${nextCursor}`),
      ]);
    }

    rows.push([Markup.button.callback(telegramCopy.buttons.toMenu, TELEGRAM_CALLBACKS.menuHome)]);

    return rows.length > 0 ? Markup.inlineKeyboard(rows) : undefined;
  },

  historyDetail: (pageCursorToken: string) =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.historyBackToList, `${TELEGRAM_CALLBACKS.historyBackPrefix}${pageCursorToken}`)],
      [Markup.button.callback(telegramCopy.buttons.toMenu, TELEGRAM_CALLBACKS.menuHome)],
    ]),

  eventTypePicker: (options: { back?: boolean } = {}) =>
    Markup.inlineKeyboard([...eventTypeButtons(), actionRow({ back: options.back })]),

  eventTitleActions: (options: { back?: boolean } = {}) =>
    Markup.inlineKeyboard([actionRow({ back: options.back })]),

  eventDescriptionActions: (options: { back?: boolean } = {}) =>
    Markup.inlineKeyboard([actionRow({ back: options.back, skip: true, skipLabel: telegramCopy.buttons.next })]),

  eventEndDateActions: (options: { back?: boolean } = {}) =>
    Markup.inlineKeyboard([actionRow({ back: options.back, skip: true, skipLabel: telegramCopy.buttons.next })]),
  statsPeriodSelector: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.stats7d, `${TELEGRAM_CALLBACKS.statsPeriodPrefix}d7`)],
      [Markup.button.callback(telegramCopy.buttons.stats30d, `${TELEGRAM_CALLBACKS.statsPeriodPrefix}d30`)],
      [Markup.button.callback(telegramCopy.buttons.statsAll, `${TELEGRAM_CALLBACKS.statsPeriodPrefix}all`)],
      [Markup.button.callback(telegramCopy.buttons.toMenu, TELEGRAM_CALLBACKS.menuHome)],
    ]),

  statsMetricSelector: (metrics: Array<{ key: string; label: string }>) =>
    Markup.inlineKeyboard([
      ...chunkButtons(
        metrics.map((metric) =>
          Markup.button.callback(metric.label, `${TELEGRAM_CALLBACKS.statsMetricPrefix}${metric.key}`),
        ),
        2,
      ),
      [Markup.button.callback(telegramCopy.buttons.back, TELEGRAM_CALLBACKS.actionBack)],
      [Markup.button.callback(telegramCopy.buttons.toMenu, TELEGRAM_CALLBACKS.menuHome)],
    ]),

  statsSummaryActions: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback(telegramCopy.buttons.statsBackToMetrics, TELEGRAM_CALLBACKS.actionBack)],
      [Markup.button.callback(telegramCopy.buttons.statsChangePeriod, TELEGRAM_CALLBACKS.statsBackToPeriods)],
      [Markup.button.callback(telegramCopy.buttons.toMenu, TELEGRAM_CALLBACKS.menuHome)],
    ]),

  settingsMenu: (options: {
    remindersEnabled: boolean;
  }) =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          getSettingsToggleButtonLabel(options.remindersEnabled),
          TELEGRAM_CALLBACKS.settingsRemindersToggle,
        ),
      ],
      [Markup.button.callback(telegramCopy.buttons.settingsEditReminderTime, TELEGRAM_CALLBACKS.settingsReminderTimeEdit)],
      [Markup.button.callback(telegramCopy.buttons.settingsSleepMode, TELEGRAM_CALLBACKS.settingsSleepModeSelect)],
      [Markup.button.callback(telegramCopy.buttons.settingsDailyMetrics, TELEGRAM_CALLBACKS.settingsDailyMetricsOpen)],
      [Markup.button.callback(telegramCopy.buttons.toMenu, TELEGRAM_CALLBACKS.menuHome)],
    ]),

  settingsDailyMetrics: (metrics: SettingsMetricOptionData[]) => {
    const metricButtons = metrics
      .filter((metric) => !metric.isCore)
      .map((metric) =>
        Markup.button.callback(
          getSettingsMetricToggleButtonLabel(metric.label, metric.enabled),
          `${TELEGRAM_CALLBACKS.settingsDailyMetricTogglePrefix}${metric.key}`,
        ),
      );

    return Markup.inlineKeyboard([
      ...chunkButtons(metricButtons, 1),
      [Markup.button.callback(telegramCopy.buttons.back, TELEGRAM_CALLBACKS.actionBack)],
    ]);
  },

  settingsSleepMode: () =>
    Markup.inlineKeyboard([
      [Markup.button.callback('Выключить сон', `${TELEGRAM_CALLBACKS.settingsSleepModePrefix}off`)],
      [Markup.button.callback(SLEEP_MODE_LABELS.hours, `${TELEGRAM_CALLBACKS.settingsSleepModePrefix}hours`)],
      [Markup.button.callback(SLEEP_MODE_LABELS.quality, `${TELEGRAM_CALLBACKS.settingsSleepModePrefix}quality`)],
      [Markup.button.callback(SLEEP_MODE_LABELS.both, `${TELEGRAM_CALLBACKS.settingsSleepModePrefix}both`)],
      [Markup.button.callback(telegramCopy.buttons.back, TELEGRAM_CALLBACKS.actionBack)],
    ]),
};
