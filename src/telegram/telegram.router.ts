import { Injectable, Logger } from '@nestjs/common';
import { SleepMode, SummaryPeriodType, type User } from '@prisma/client';
import type { Context, Telegraf } from 'telegraf';

import { AnalyticsService } from '../analytics/analytics.service';
import { ChartsService } from '../charts/charts.service';
import { CheckinsFlowService, type CheckinFlowResult } from '../checkins/checkins.flow';
import { CheckinsService } from '../checkins/checkins.service';
import { TELEGRAM_CALLBACKS, TELEGRAM_MAIN_MENU_BUTTONS } from '../common/constants/app.constants';
import { isValidTimeFormat } from '../common/utils/validation.utils';
import { EventsFlowService, type EventFlowResult } from '../events/events.flow';
import { FsmService } from '../fsm/fsm.service';
import { FSM_STATES, type CheckinDraftPayload, type FsmState } from '../fsm/fsm.types';
import { OnboardingFlow } from '../onboarding/onboarding.flow';
import { RemindersService } from '../reminders/reminders.service';
import { SummariesService } from '../summaries/summaries.service';
import { type PeriodStatsPayload } from '../stats/stats.types';
import { TagsService } from '../tags/tags.service';
import { UsersService } from '../users/users.service';
import {
  SLEEP_MODE_LABELS,
  formatCheckinConfirmation,
  formatHistoryEntries,
  telegramCopy,
  type CheckinConfirmationData,
} from './telegram.copy';
import { extractTelegramProfile, getCallbackData, normalizeTelegramText } from './telegram.helpers';
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
    private readonly summariesService: SummariesService,
    private readonly chartsService: ChartsService,
    private readonly remindersService: RemindersService,
    private readonly tagsService: TagsService,
    private readonly fsmService: FsmService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  register(bot: Telegraf<Context>): void {
    bot.start((ctx) => this.runSafely(ctx, () => this.handleStartCommand(ctx), 'start'));
    bot.command('checkin', (ctx) => this.runSafely(ctx, () => this.handleCheckinCommand(ctx), 'checkin'));
    bot.command('event', (ctx) => this.runSafely(ctx, () => this.handleEventCommand(ctx), 'event'));
    bot.command('stats', (ctx) => this.runSafely(ctx, () => this.handleStatsCommand(ctx), 'stats'));
    bot.command('history', (ctx) => this.runSafely(ctx, () => this.handleHistoryCommand(ctx), 'history'));
    bot.command('settings', (ctx) => this.runSafely(ctx, () => this.handleSettingsCommand(ctx), 'settings'));
    bot.command('help', (ctx) => this.runSafely(ctx, () => this.handleHelpCommand(ctx), 'help'));

    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[0], (ctx) => this.runSafely(ctx, () => this.handleCheckinCommand(ctx), 'menu:checkin'));
    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[1], (ctx) => this.runSafely(ctx, () => this.handleEventCommand(ctx), 'menu:event'));
    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[2], (ctx) => this.runSafely(ctx, () => this.handleStatsCommand(ctx), 'menu:stats'));
    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[3], (ctx) => this.runSafely(ctx, () => this.handleHistoryCommand(ctx), 'menu:history'));
    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[4], (ctx) => this.runSafely(ctx, () => this.handleSettingsCommand(ctx), 'menu:settings'));
    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[5], (ctx) => this.runSafely(ctx, () => this.handleHelpCommand(ctx), 'menu:help'));

    bot.on('callback_query', (ctx) => this.runSafely(ctx, () => this.handleCallbackQuery(ctx), 'callback_query'));
    bot.on('text', (ctx) => this.runSafely(ctx, () => this.handleTextMessage(ctx), 'text'));
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
    if (!user || !(await this.ensureOnboardingCompleted(ctx, user))) {
      return;
    }

    const result = await this.checkinsFlow.start(user);
    await ctx.reply(telegramCopy.checkin.started);
    await this.replyCheckinResult(ctx, user, result);
  }

  private async handleEventCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user || !(await this.ensureOnboardingCompleted(ctx, user))) {
      return;
    }

    const result = await this.eventsFlow.startStandalone(user);
    await ctx.reply(telegramCopy.event.startedStandalone);
    await this.replyEventResult(ctx, user, result);
  }

  private async handleStatsCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user || !(await this.ensureOnboardingCompleted(ctx, user))) {
      return;
    }

    await this.fsmService.setState(user.id, FSM_STATES.stats_period_select, {});
    await this.analyticsService.track('stats_requested', {}, user.id);
    this.logger.log(`Opened stats period selector for user ${user.id}`);
    await ctx.reply(telegramCopy.stats.periodPrompt, telegramKeyboards.statsPeriodSelector());
  }

  private async handleHistoryCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user || !(await this.ensureOnboardingCompleted(ctx, user))) {
      return;
    }

    await this.analyticsService.track('history_requested', {}, user.id);
    const entries = await this.checkinsService.getRecentEntries(user.id, 7);
    await ctx.reply(formatHistoryEntries(entries), telegramKeyboards.mainMenu());
  }

  private async handleSettingsCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user || !(await this.ensureOnboardingCompleted(ctx, user))) {
      return;
    }

    await this.fsmService.setState(user.id, FSM_STATES.settings_menu, {});
    await this.analyticsService.track('settings_opened', {}, user.id);
    await this.replySettingsMenu(ctx, user);
  }

  private async handleHelpCommand(ctx: Context): Promise<void> {
    await ctx.reply(telegramCopy.help.text, telegramKeyboards.mainMenu());
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
      if (state === FSM_STATES.settings_menu) {
        const payload = await this.getSessionPayload(user.id);
        if (payload.settingsAwaiting === 'sleep_mode') {
          await this.fsmService.setState(user.id, FSM_STATES.settings_menu, {});
          await this.replySettingsMenu(ctx, user);
          return;
        }
      }

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

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.statsPeriodPrefix)) {
      if (state !== FSM_STATES.stats_period_select) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      const periodRaw = callbackData.slice(TELEGRAM_CALLBACKS.statsPeriodPrefix.length);
      const periodType = this.parseSummaryPeriod(periodRaw);

      if (!periodType) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      await this.handleStatsPeriodSelection(ctx, user, periodType);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.settingsRemindersToggle) {
      if (state !== FSM_STATES.settings_menu) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      const updatedUser = await this.usersService.setRemindersEnabled(user.id, !user.remindersEnabled);

      if (updatedUser.remindersEnabled) {
        await this.remindersService.rescheduleDailyReminder(user.id);
      } else {
        await this.remindersService.cancelDailyReminder(user.id);
      }

      await this.analyticsService.track(
        'settings_updated',
        { field: 'remindersEnabled', value: updatedUser.remindersEnabled },
        user.id,
      );

      await ctx.reply(telegramCopy.settings.remindersToggled);
      await this.replySettingsMenu(ctx, updatedUser);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.settingsReminderTimeEdit) {
      if (state !== FSM_STATES.settings_menu) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      await this.fsmService.setState(user.id, FSM_STATES.settings_menu, {
        settingsAwaiting: 'reminder_time',
      });
      await ctx.reply(telegramCopy.settings.reminderTimePrompt, telegramKeyboards.cancelOnly());
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.settingsSleepModeSelect) {
      if (state !== FSM_STATES.settings_menu) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      await this.fsmService.setState(user.id, FSM_STATES.settings_menu, {
        settingsAwaiting: 'sleep_mode',
      });
      await ctx.reply(telegramCopy.settings.sleepModePrompt, telegramKeyboards.settingsSleepMode());
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.settingsSleepModePrefix)) {
      if (state !== FSM_STATES.settings_menu) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      const modeRaw = callbackData.slice(TELEGRAM_CALLBACKS.settingsSleepModePrefix.length);
      const sleepMode = this.parseSleepMode(modeRaw);

      if (!sleepMode) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      const updatedUser = await this.usersService.setSleepMode(user.id, sleepMode);
      await this.fsmService.setState(user.id, FSM_STATES.settings_menu, {});
      await this.analyticsService.track('settings_updated', { field: 'sleepMode', value: sleepMode }, user.id);

      await ctx.reply(telegramCopy.settings.sleepModeUpdated);
      await this.replySettingsMenu(ctx, updatedUser);
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
        await ctx.reply(telegramCopy.onboarding.firstCheckinOffer, telegramKeyboards.onboardingFirstCheckin());
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
      case FSM_STATES.event_description:
        await this.handleEventTextByState(ctx, user, state, text);
        return;
      case FSM_STATES.settings_menu:
        await this.handleSettingsTextInput(ctx, user, text);
        return;
      case FSM_STATES.stats_period_select:
        await ctx.reply(telegramCopy.stats.periodPrompt, telegramKeyboards.statsPeriodSelector());
        return;
      default:
        break;
    }

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
  }

  private async handleStatsPeriodSelection(
    ctx: Context,
    user: User,
    periodType: SummaryPeriodType,
  ): Promise<void> {
    await this.analyticsService.track('summary_requested', { periodType }, user.id);
    await ctx.reply(telegramCopy.stats.loading);

    const payload = await this.summariesService.generateSummary(user.id, periodType, {
      timezone: user.timezone,
      persist: true,
    });

    if (payload.entriesCount === 0) {
      await this.fsmService.setIdle(user.id);
      await ctx.reply(telegramCopy.stats.empty, telegramKeyboards.mainMenu());
      return;
    }

    await ctx.reply(this.summariesService.formatSummaryText(payload), telegramKeyboards.mainMenu());
    await this.analyticsService.track('summary_sent', { periodType }, user.id);

    await this.sendStatsCharts(ctx, user, payload);
    await this.fsmService.setIdle(user.id);
  }

  private async sendStatsCharts(ctx: Context, user: User, payload: PeriodStatsPayload): Promise<void> {
    try {
      const charts = await this.chartsService.generatePeriodCharts(payload.chartPoints);

      if (charts.combinedChartBuffer) {
        await ctx.replyWithPhoto(
          { source: charts.combinedChartBuffer },
          { caption: telegramCopy.stats.chartCombinedCaption },
        );
      }

      if (charts.sleepChartBuffer) {
        await ctx.replyWithPhoto(
          { source: charts.sleepChartBuffer },
          { caption: telegramCopy.stats.chartSleepCaption },
        );
      }

      if (charts.combinedChartBuffer || charts.sleepChartBuffer) {
        await this.analyticsService.track(
          'chart_generated',
          {
            combined: !!charts.combinedChartBuffer,
            sleep: !!charts.sleepChartBuffer,
          },
          user.id,
        );
      }
    } catch (error) {
      this.logger.warn(`Chart generation failed: ${(error as Error).message}`);
      await this.analyticsService.track('chart_generation_failed', { reason: (error as Error).message }, user.id);
      await ctx.reply(telegramCopy.stats.chartUnavailable);
    }
  }

  private async handleSettingsTextInput(ctx: Context, user: User, text: string): Promise<void> {
    const payload = await this.getSessionPayload(user.id);

    if (payload.settingsAwaiting !== 'reminder_time') {
      await this.replySettingsMenu(ctx, user);
      return;
    }

    if (!isValidTimeFormat(text)) {
      await ctx.reply(telegramCopy.validation.invalidTime, telegramKeyboards.cancelOnly());
      return;
    }

    const updatedUser = await this.usersService.setReminderTime(user.id, text);

    if (updatedUser.remindersEnabled) {
      await this.remindersService.rescheduleDailyReminder(user.id);
    }

    await this.fsmService.setState(user.id, FSM_STATES.settings_menu, {});
    await this.analyticsService.track('settings_updated', { field: 'reminderTime', value: text }, user.id);

    await ctx.reply(telegramCopy.settings.reminderTimeUpdated);
    await this.replySettingsMenu(ctx, updatedUser);
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

  private async replyCheckinResult(ctx: Context, user: User, result: CheckinFlowResult): Promise<void> {
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

  private async replySettingsMenu(ctx: Context, user: User): Promise<void> {
    const lines = [
      telegramCopy.settings.title,
      user.remindersEnabled ? telegramCopy.settings.remindersEnabled : telegramCopy.settings.remindersDisabled,
      `${telegramCopy.settings.reminderTimeLabel}: ${user.reminderTime ?? '—'}`,
      `Режим сна: ${SLEEP_MODE_LABELS[user.sleepMode]}`,
    ];

    await ctx.reply(lines.join('\n'), telegramKeyboards.settingsMenu(user.remindersEnabled));
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

  private parseSummaryPeriod(value: string): SummaryPeriodType | null {
    if (value === SummaryPeriodType.d7 || value === SummaryPeriodType.d30 || value === SummaryPeriodType.all) {
      return value;
    }

    return null;
  }

  private parseSleepMode(value: string): SleepMode | null {
    if (value === SleepMode.hours || value === SleepMode.quality || value === SleepMode.both) {
      return value;
    }

    return null;
  }

  private async getSessionPayload(userId: string): Promise<CheckinDraftPayload> {
    const session = await this.fsmService.getSession(userId);

    if (!session?.payloadJson || typeof session.payloadJson !== 'object') {
      return {};
    }

    return session.payloadJson as CheckinDraftPayload;
  }

  private async runSafely(
    ctx: Context,
    handler: () => Promise<void>,
    routeKey: string,
  ): Promise<void> {
    try {
      await handler();
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Telegram route failed: ${routeKey}: ${err.message}`, err.stack);
      await this.recoverFromUnexpectedFlow(ctx);

      try {
        await ctx.reply(telegramCopy.common.unexpectedError, telegramKeyboards.mainMenu());
      } catch (replyError) {
        this.logger.warn(`Failed to send fallback reply for ${routeKey}: ${(replyError as Error).message}`);
      }
    }
  }

  private async recoverFromUnexpectedFlow(ctx: Context): Promise<void> {
    const profile = extractTelegramProfile(ctx);

    if (!profile) {
      return;
    }

    const user = await this.usersService.findByTelegramId(profile.telegramId);

    if (!user) {
      return;
    }

    const state = await this.fsmService.getState(user.id);

    if (state !== FSM_STATES.idle) {
      await this.fsmService.setIdle(user.id);
      this.logger.warn(`FSM session reset after unexpected error for user ${user.id}`);
    }
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
