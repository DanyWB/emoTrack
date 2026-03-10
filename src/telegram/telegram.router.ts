import { Injectable, Logger } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Context, Telegraf } from 'telegraf';

import { AnalyticsService } from '../analytics/analytics.service';
import { CheckinsFlowService, type CheckinFlowResult } from '../checkins/checkins.flow';
import { CheckinsService } from '../checkins/checkins.service';
import { TELEGRAM_CALLBACKS, TELEGRAM_MAIN_MENU_BUTTONS } from '../common/constants/app.constants';
import { EventsFlowService, type EventFlowResult } from '../events/events.flow';
import { FsmService } from '../fsm/fsm.service';
import { FSM_STATES, type CheckinDraftPayload, type FsmState } from '../fsm/fsm.types';
import { OnboardingFlow } from '../onboarding/onboarding.flow';
import { TagsService } from '../tags/tags.service';
import { UsersService } from '../users/users.service';
import {
  formatCheckinConfirmation,
  formatHistoryEntries,
  telegramCopy,
  type CheckinConfirmationData,
} from './telegram.copy';
import {
  extractTelegramProfile,
  getCallbackData,
  normalizeTelegramText,
} from './telegram.helpers';
import { telegramKeyboards } from './telegram.keyboards';

@Injectable()
export class TelegramRouter {
  private readonly logger = new Logger(TelegramRouter.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly onboardingFlow: OnboardingFlow,
    private readonly checkinsFlow: CheckinsFlowService,
    private readonly checkinsService: CheckinsService,
    private readonly eventsFlow: EventsFlowService,
    private readonly tagsService: TagsService,
    private readonly fsmService: FsmService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  register(bot: Telegraf<Context>): void {
    bot.start(async (ctx) => {
      await this.handleStartCommand(ctx);
    });

    bot.command('checkin', async (ctx) => {
      await this.handleCheckinCommand(ctx);
    });

    bot.command('event', async (ctx) => {
      await this.handleEventCommand(ctx);
    });

    bot.command('stats', async (ctx) => {
      await ctx.reply(telegramCopy.placeholders.stats, telegramKeyboards.mainMenu());
    });

    bot.command('history', async (ctx) => {
      await this.handleHistoryCommand(ctx);
    });

    bot.command('settings', async (ctx) => {
      await ctx.reply(telegramCopy.placeholders.settings, telegramKeyboards.mainMenu());
    });

    bot.command('help', async (ctx) => {
      await ctx.reply(telegramCopy.placeholders.help, telegramKeyboards.mainMenu());
    });

    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[0], async (ctx) => {
      await this.handleCheckinCommand(ctx);
    });

    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[1], async (ctx) => {
      await this.handleEventCommand(ctx);
    });

    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[2], async (ctx) => {
      await ctx.reply(telegramCopy.placeholders.stats, telegramKeyboards.mainMenu());
    });

    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[3], async (ctx) => {
      await this.handleHistoryCommand(ctx);
    });

    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[4], async (ctx) => {
      await ctx.reply(telegramCopy.placeholders.settings, telegramKeyboards.mainMenu());
    });

    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[5], async (ctx) => {
      await ctx.reply(telegramCopy.placeholders.help, telegramKeyboards.mainMenu());
    });

    bot.on('callback_query', async (ctx) => {
      await this.handleCallbackQuery(ctx);
    });

    bot.on('text', async (ctx) => {
      await this.handleTextMessage(ctx);
    });
  }

  private async handleStartCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);

    if (!user) {
      return;
    }

    await this.analyticsService.track('bot_started', {}, user.id);

    const onboarding = await this.onboardingFlow.startOrResume(user, true);

    if (onboarding.step === 'already_ready') {
      await ctx.reply(telegramCopy.startup.alreadyReady, telegramKeyboards.mainMenu());
      return;
    }

    if (onboarding.step === 'invalid_reminder_time') {
      await ctx.reply(telegramCopy.validation.invalidTime, telegramKeyboards.cancelOnly());
      return;
    }

    await this.replyOnboardingStep(ctx, onboarding.step, onboarding.includeIntro ?? false);
  }

  private async handleCheckinCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);

    if (!user) {
      return;
    }

    const canContinue = await this.ensureOnboardingCompleted(ctx, user);

    if (!canContinue) {
      return;
    }

    const result = await this.checkinsFlow.start(user);
    await ctx.reply(telegramCopy.checkin.started);
    await this.replyCheckinResult(ctx, user, result);
  }

  private async handleEventCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);

    if (!user) {
      return;
    }

    const canContinue = await this.ensureOnboardingCompleted(ctx, user);

    if (!canContinue) {
      return;
    }

    const result = await this.eventsFlow.startStandalone(user);
    await ctx.reply(telegramCopy.event.startedStandalone);
    await this.replyEventResult(ctx, user, result);
  }

  private async handleHistoryCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);

    if (!user) {
      return;
    }

    const canContinue = await this.ensureOnboardingCompleted(ctx, user);

    if (!canContinue) {
      return;
    }

    await this.analyticsService.track('history_requested', {}, user.id);

    const entries = await this.checkinsService.getRecentEntries(user.id, 7);
    await ctx.reply(formatHistoryEntries(entries), telegramKeyboards.mainMenu());
  }

  private async handleCallbackQuery(ctx: Context): Promise<void> {
    const callbackData = getCallbackData(ctx);

    if (!callbackData) {
      return;
    }

    const user = await this.getOrCreateUserFromContext(ctx);

    if (!user) {
      return;
    }

    await ctx.answerCbQuery().catch(() => undefined);

    const state = await this.fsmService.getState(user.id);

    if (callbackData === TELEGRAM_CALLBACKS.actionCancel) {
      await this.checkinsFlow.cancel(user.id);
      await this.onboardingFlow.cancel(user.id);

      if (state === FSM_STATES.onboarding_consent) {
        await ctx.reply(telegramCopy.onboarding.consentDeclined, telegramKeyboards.mainMenu());
        return;
      }

      await ctx.reply(telegramCopy.common.cancelled, telegramKeyboards.mainMenu());
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.actionBack) {
      if (this.isEventState(state)) {
        const result = await this.eventsFlow.goBack(user);
        await this.replyEventResult(ctx, user, result);
        return;
      }

      const result = await this.checkinsFlow.goBack(user);
      await this.replyCheckinResult(ctx, user, result);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.actionSkip) {
      if (state === FSM_STATES.event_description) {
        const result = await this.eventsFlow.skipDescription(user);
        await this.replyEventResult(ctx, user, result);
        return;
      }

      if (state === FSM_STATES.checkin_add_event_confirm) {
        const result = await this.checkinsFlow.finalizeAfterEventSkip(user);
        await this.replyCheckinResult(ctx, user, result);
        return;
      }

      const result = await this.checkinsFlow.skipCurrentStep(user);
      await this.replyCheckinResult(ctx, user, result);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.consentAccept) {
      if (state !== FSM_STATES.onboarding_consent) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      await this.onboardingFlow.acceptConsent(user);
      await ctx.reply(telegramCopy.onboarding.consentAccepted);
      await ctx.reply(telegramCopy.onboarding.reminderPrompt, telegramKeyboards.cancelOnly());
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.onboardingStartFirstCheckin) {
      await this.onboardingFlow.finishFirstCheckinOffer(user.id);
      await this.handleCheckinCommand(ctx);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.onboardingLater) {
      await this.onboardingFlow.finishFirstCheckinOffer(user.id);
      await ctx.reply(telegramCopy.onboarding.firstCheckinDeferred, telegramKeyboards.mainMenu());
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.checkinNoteAdd) {
      const result = await this.checkinsFlow.beginNoteStep(user);
      await this.replyCheckinResult(ctx, user, result);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.checkinTagsStart) {
      const result = await this.checkinsFlow.startTagsSelection(user);
      await this.replyCheckinResult(ctx, user, result);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.checkinTagsDone) {
      const result = await this.checkinsFlow.confirmTags(user);
      await this.replyCheckinResult(ctx, user, result);
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.checkinTagsTogglePrefix)) {
      const tagId = callbackData.slice(TELEGRAM_CALLBACKS.checkinTagsTogglePrefix.length);
      const result = await this.checkinsFlow.toggleTagSelection(user, tagId);
      await this.replyCheckinResult(ctx, user, result);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.checkinEventAdd) {
      const result = await this.eventsFlow.startFromCheckin(user);
      await this.replyEventResult(ctx, user, result);
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.eventTypePrefix)) {
      const eventType = callbackData.slice(TELEGRAM_CALLBACKS.eventTypePrefix.length);
      const result = await this.eventsFlow.submitType(user, eventType);
      await this.replyEventResult(ctx, user, result);
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.scorePrefix)) {
      const scoreRaw = callbackData.slice(TELEGRAM_CALLBACKS.scorePrefix.length);

      if (state === FSM_STATES.event_score) {
        const eventResult = await this.eventsFlow.submitScore(user, scoreRaw);
        await this.replyEventResult(ctx, user, eventResult);
        return;
      }

      const checkinResult = await this.checkinsFlow.submitScore(user, scoreRaw);
      await this.replyCheckinResult(ctx, user, checkinResult);
      return;
    }

    await ctx.reply(telegramCopy.common.actionNotAllowed);
  }

  private async handleTextMessage(ctx: Context): Promise<void> {
    const message = ctx.message;

    if (!message || !('text' in message)) {
      return;
    }

    const text = normalizeTelegramText(message.text);

    if (!text || text.startsWith('/')) {
      return;
    }

    if (TELEGRAM_MAIN_MENU_BUTTONS.includes(text as (typeof TELEGRAM_MAIN_MENU_BUTTONS)[number])) {
      return;
    }

    const user = await this.getOrCreateUserFromContext(ctx);

    if (!user) {
      return;
    }

    const state = await this.fsmService.getState(user.id);

    switch (state) {
      case FSM_STATES.onboarding_reminder_time:
        await this.handleReminderTimeInput(ctx, user, text);
        return;
      case FSM_STATES.onboarding_consent:
        await ctx.reply(telegramCopy.onboarding.consentPrompt, telegramKeyboards.consent());
        return;
      case FSM_STATES.onboarding_first_checkin:
        await ctx.reply(
          telegramCopy.onboarding.firstCheckinOffer,
          telegramKeyboards.onboardingFirstCheckin(),
        );
        return;
      case FSM_STATES.checkin_mood:
      case FSM_STATES.checkin_energy:
      case FSM_STATES.checkin_stress:
      case FSM_STATES.checkin_sleep_quality: {
        const result = await this.checkinsFlow.submitScore(user, text);
        await this.replyCheckinResult(ctx, user, result);
        return;
      }
      case FSM_STATES.checkin_sleep_hours: {
        const result = await this.checkinsFlow.submitSleepHours(user, text);
        await this.replyCheckinResult(ctx, user, result);
        return;
      }
      case FSM_STATES.checkin_note: {
        const result = await this.checkinsFlow.submitNote(user, text);
        await this.replyCheckinResult(ctx, user, result);
        return;
      }
      case FSM_STATES.checkin_note_prompt:
      case FSM_STATES.checkin_tags_prompt:
      case FSM_STATES.checkin_tags:
      case FSM_STATES.checkin_add_event_confirm: {
        await this.replyCheckinPromptByState(ctx, user, state);
        return;
      }
      case FSM_STATES.event_type:
      case FSM_STATES.event_title:
      case FSM_STATES.event_score:
      case FSM_STATES.event_description: {
        await this.handleEventTextByState(ctx, user, state, text);
        return;
      }
      default: {
        if (!user.onboardingCompleted) {
          await ctx.reply(telegramCopy.onboarding.incompleteRedirect);
          const onboarding = await this.onboardingFlow.startOrResume(user, false);

          if (onboarding.step === 'already_ready') {
            await ctx.reply(telegramCopy.startup.alreadyReady, telegramKeyboards.mainMenu());
            return;
          }

          if (onboarding.step === 'invalid_reminder_time') {
            await ctx.reply(telegramCopy.validation.invalidTime, telegramKeyboards.cancelOnly());
            return;
          }

          await this.replyOnboardingStep(ctx, onboarding.step, onboarding.includeIntro ?? false);
          return;
        }

        await ctx.reply(telegramCopy.startup.unknownInput, telegramKeyboards.mainMenu());
        return;
      }
    }
  }

  private async handleEventTextByState(
    ctx: Context,
    user: User,
    state: FsmState,
    text: string,
  ): Promise<void> {
    if (state === FSM_STATES.event_type) {
      await this.replyEventPromptByState(ctx, user, state);
      return;
    }

    if (state === FSM_STATES.event_title) {
      const result = await this.eventsFlow.submitTitle(user, text);
      await this.replyEventResult(ctx, user, result);
      return;
    }

    if (state === FSM_STATES.event_score) {
      const result = await this.eventsFlow.submitScore(user, text);
      await this.replyEventResult(ctx, user, result);
      return;
    }

    const result = await this.eventsFlow.submitDescription(user, text);
    await this.replyEventResult(ctx, user, result);
  }

  private async handleReminderTimeInput(ctx: Context, user: User, reminderTime: string): Promise<void> {
    const result = await this.onboardingFlow.submitReminderTime(user, reminderTime);

    if (result.step === 'invalid_reminder_time') {
      await ctx.reply(telegramCopy.validation.invalidTime, telegramKeyboards.cancelOnly());
      return;
    }

    await ctx.reply(telegramCopy.onboarding.reminderSaved);
    await this.replyOnboardingStep(ctx, result.step, false);
  }

  private async replyOnboardingStep(
    ctx: Context,
    step: 'ask_consent' | 'ask_reminder_time' | 'first_checkin_offer' | 'already_ready',
    includeIntro: boolean,
  ): Promise<void> {
    if (step === 'already_ready') {
      await ctx.reply(telegramCopy.startup.alreadyReady, telegramKeyboards.mainMenu());
      return;
    }

    if (step === 'ask_consent') {
      if (includeIntro) {
        await ctx.reply(telegramCopy.onboarding.intro);
        await ctx.reply(telegramCopy.onboarding.disclaimer);
      }

      await ctx.reply(telegramCopy.onboarding.consentPrompt, telegramKeyboards.consent());
      return;
    }

    if (step === 'ask_reminder_time') {
      await ctx.reply(telegramCopy.onboarding.reminderPrompt, telegramKeyboards.cancelOnly());
      return;
    }

    await ctx.reply(telegramCopy.onboarding.completed);
    await ctx.reply(telegramCopy.onboarding.firstCheckinOffer, telegramKeyboards.onboardingFirstCheckin());
  }

  private async replyCheckinResult(
    ctx: Context,
    user: User,
    result: CheckinFlowResult,
  ): Promise<void> {
    if (result.status === 'next' && result.nextState) {
      await this.replyCheckinPromptByState(ctx, user, result.nextState, result.selectedTagIds);
      return;
    }

    if (result.status === 'saved' && result.entryPayload) {
      const confirmation: CheckinConfirmationData = {
        moodScore: result.entryPayload.moodScore,
        energyScore: result.entryPayload.energyScore,
        stressScore: result.entryPayload.stressScore,
        sleepHours: result.entryPayload.sleepHours,
        sleepQuality: result.entryPayload.sleepQuality,
        updated: result.isUpdate ?? false,
        noteAdded: result.noteAdded,
        tagsCount: result.tagsCount,
        eventAdded: result.eventAdded,
      };

      await ctx.reply(formatCheckinConfirmation(confirmation), telegramKeyboards.mainMenu());
      return;
    }

    if (result.status === 'invalid_score') {
      await ctx.reply(telegramCopy.validation.invalidScore);
      const state = await this.fsmService.getState(user.id);
      await this.replyCheckinPromptByState(ctx, user, state);
      return;
    }

    if (result.status === 'invalid_sleep_hours') {
      await ctx.reply(telegramCopy.validation.invalidSleepHours, telegramKeyboards.sleepHoursActions({ back: true }));
      return;
    }

    if (result.status === 'invalid_note') {
      await ctx.reply(telegramCopy.validation.invalidNoteLength, telegramKeyboards.eventTitleActions({ back: true }));
      return;
    }

    if (result.status === 'invalid_tag') {
      await ctx.reply(telegramCopy.validation.invalidTagSelection);
      const state = await this.fsmService.getState(user.id);
      await this.replyCheckinPromptByState(ctx, user, state);
      return;
    }

    if (result.status === 'cannot_back') {
      await ctx.reply(telegramCopy.common.backUnavailable);
      const state = await this.fsmService.getState(user.id);
      await this.replyCheckinPromptByState(ctx, user, state);
      return;
    }

    await ctx.reply(telegramCopy.common.actionNotAllowed);
  }

  private async replyEventResult(ctx: Context, user: User, result: EventFlowResult): Promise<void> {
    if (result.status === 'next' && result.nextState) {
      await this.replyEventPromptByState(ctx, user, result.nextState, result.source);
      return;
    }

    if (result.status === 'created') {
      if (result.source === 'checkin' && result.checkinPayload) {
        const checkinPayload = result.checkinPayload;

        if (
          typeof checkinPayload.moodScore === 'number' &&
          typeof checkinPayload.energyScore === 'number' &&
          typeof checkinPayload.stressScore === 'number'
        ) {
          await ctx.reply(
            formatCheckinConfirmation({
              moodScore: checkinPayload.moodScore,
              energyScore: checkinPayload.energyScore,
              stressScore: checkinPayload.stressScore,
              sleepHours: checkinPayload.sleepHours,
              sleepQuality: checkinPayload.sleepQuality,
              updated: checkinPayload.isUpdate ?? false,
              noteAdded: !!checkinPayload.noteText,
              tagsCount: checkinPayload.selectedTagIds?.length ?? 0,
              eventAdded: true,
            }),
            telegramKeyboards.mainMenu(),
          );
          return;
        }
      }

      await ctx.reply(telegramCopy.event.savedStandalone, telegramKeyboards.mainMenu());
      return;
    }

    if (result.status === 'invalid_type') {
      await ctx.reply(telegramCopy.validation.invalidEventType);
      await this.replyEventPromptByState(ctx, user, FSM_STATES.event_type, result.source);
      return;
    }

    if (result.status === 'invalid_title') {
      await ctx.reply(telegramCopy.validation.invalidEventTitle);
      await this.replyEventPromptByState(ctx, user, FSM_STATES.event_title, result.source);
      return;
    }

    if (result.status === 'invalid_score') {
      await ctx.reply(telegramCopy.validation.invalidEventScore);
      await this.replyEventPromptByState(ctx, user, FSM_STATES.event_score, result.source);
      return;
    }

    if (result.status === 'invalid_description') {
      await ctx.reply(telegramCopy.validation.invalidEventDescription);
      await this.replyEventPromptByState(ctx, user, FSM_STATES.event_description, result.source);
      return;
    }

    if (result.status === 'cannot_back') {
      await ctx.reply(telegramCopy.common.backUnavailable);
      const state = await this.fsmService.getState(user.id);
      await this.replyEventPromptByState(ctx, user, state, result.source);
      return;
    }

    await ctx.reply(telegramCopy.common.actionNotAllowed);
  }

  private async replyCheckinPromptByState(
    ctx: Context,
    user: User,
    state: FsmState,
    selectedTagIds: string[] = [],
  ): Promise<void> {
    switch (state) {
      case FSM_STATES.checkin_mood:
        await ctx.reply(telegramCopy.checkin.moodPrompt, telegramKeyboards.scorePicker());
        return;
      case FSM_STATES.checkin_energy:
        await ctx.reply(telegramCopy.checkin.energyPrompt, telegramKeyboards.scorePicker({ back: true }));
        return;
      case FSM_STATES.checkin_stress:
        await ctx.reply(telegramCopy.checkin.stressPrompt, telegramKeyboards.scorePicker({ back: true }));
        return;
      case FSM_STATES.checkin_sleep_hours:
        await ctx.reply(telegramCopy.checkin.sleepHoursPrompt, telegramKeyboards.sleepHoursActions({ back: true }));
        return;
      case FSM_STATES.checkin_sleep_quality:
        await ctx.reply(telegramCopy.checkin.sleepQualityPrompt, telegramKeyboards.sleepQualityActions({ back: true }));
        return;
      case FSM_STATES.checkin_note_prompt:
        await ctx.reply(telegramCopy.checkin.notePrompt, telegramKeyboards.checkinNotePrompt());
        return;
      case FSM_STATES.checkin_note:
        await ctx.reply(telegramCopy.checkin.noteInputPrompt, telegramKeyboards.eventTitleActions({ back: true }));
        return;
      case FSM_STATES.checkin_tags_prompt:
        await ctx.reply(telegramCopy.checkin.tagsPrompt, telegramKeyboards.checkinTagsPrompt());
        return;
      case FSM_STATES.checkin_tags: {
        const tags = await this.tagsService.getActiveTags();

        if (tags.length === 0) {
          const result = await this.checkinsFlow.skipCurrentStep(user);
          await ctx.reply(telegramCopy.checkin.noActiveTags);
          await this.replyCheckinResult(ctx, user, result);
          return;
        }

        const effectiveSelected =
          selectedTagIds.length > 0 ? selectedTagIds : await this.getSelectedTagIdsFromSession(user.id);

        await ctx.reply(
          telegramCopy.checkin.tagsSelectionPrompt,
          telegramKeyboards.checkinTagsSelection(tags, effectiveSelected),
        );
        return;
      }
      case FSM_STATES.checkin_add_event_confirm:
        await ctx.reply(telegramCopy.checkin.addEventPrompt, telegramKeyboards.checkinAddEventPrompt());
        return;
      default:
        await ctx.reply(telegramCopy.checkin.repeatedStepPrompt, telegramKeyboards.mainMenu());
    }
  }

  private async replyEventPromptByState(
    ctx: Context,
    user: User,
    state: FsmState,
    source?: 'standalone' | 'checkin',
  ): Promise<void> {
    const isFromCheckin = source === 'checkin';

    switch (state) {
      case FSM_STATES.event_type:
        await ctx.reply(telegramCopy.event.typePrompt, telegramKeyboards.eventTypePicker({ back: isFromCheckin }));
        return;
      case FSM_STATES.event_title:
        await ctx.reply(telegramCopy.event.titlePrompt, telegramKeyboards.eventTitleActions({ back: true }));
        return;
      case FSM_STATES.event_score:
        await ctx.reply(telegramCopy.event.scorePrompt, telegramKeyboards.scorePicker({ back: true }));
        return;
      case FSM_STATES.event_description:
        await ctx.reply(
          telegramCopy.event.descriptionPrompt,
          telegramKeyboards.eventDescriptionActions({ back: true }),
        );
        return;
      case FSM_STATES.checkin_add_event_confirm:
        await this.replyCheckinPromptByState(ctx, user, FSM_STATES.checkin_add_event_confirm);
        return;
      default:
        await ctx.reply(telegramCopy.common.actionNotAllowed, telegramKeyboards.mainMenu());
    }
  }

  private async ensureOnboardingCompleted(ctx: Context, user: User): Promise<boolean> {
    if (user.onboardingCompleted) {
      return true;
    }

    await ctx.reply(telegramCopy.onboarding.incompleteRedirect);
    const onboarding = await this.onboardingFlow.startOrResume(user, false);

    if (onboarding.step === 'already_ready') {
      await ctx.reply(telegramCopy.startup.alreadyReady, telegramKeyboards.mainMenu());
      return false;
    }

    if (onboarding.step === 'invalid_reminder_time') {
      await ctx.reply(telegramCopy.validation.invalidTime, telegramKeyboards.cancelOnly());
      return false;
    }

    await this.replyOnboardingStep(ctx, onboarding.step, onboarding.includeIntro ?? false);
    return false;
  }

  private async getSelectedTagIdsFromSession(userId: string): Promise<string[]> {
    const session = await this.fsmService.getSession(userId);

    if (!session?.payloadJson || typeof session.payloadJson !== 'object') {
      return [];
    }

    const payload = session.payloadJson as CheckinDraftPayload;
    const selectedTagIds = payload.selectedTagIds;

    if (!Array.isArray(selectedTagIds)) {
      return [];
    }

    return selectedTagIds.filter((item): item is string => typeof item === 'string');
  }

  private isEventState(state: FsmState): boolean {
    return (
      state === FSM_STATES.event_type ||
      state === FSM_STATES.event_title ||
      state === FSM_STATES.event_score ||
      state === FSM_STATES.event_description
    );
  }

  private async getOrCreateUserFromContext(ctx: Context): Promise<User | null> {
    const profile = extractTelegramProfile(ctx);

    if (!profile) {
      this.logger.warn('Telegram update without user profile.');
      return null;
    }

    return this.usersService.getOrCreateTelegramUser(profile);
  }
}
