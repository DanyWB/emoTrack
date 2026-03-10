import { Injectable, Logger } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Context, Telegraf } from 'telegraf';

import { CheckinsFlowService, type CheckinFlowResult } from '../checkins/checkins.flow';
import { TELEGRAM_CALLBACKS, TELEGRAM_MAIN_MENU_BUTTONS } from '../common/constants/app.constants';
import { FsmService } from '../fsm/fsm.service';
import { FSM_STATES, type FsmState } from '../fsm/fsm.types';
import { OnboardingFlow } from '../onboarding/onboarding.flow';
import { UsersService } from '../users/users.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  formatCheckinConfirmation,
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
      await ctx.reply(telegramCopy.placeholders.event, telegramKeyboards.mainMenu());
    });

    bot.command('stats', async (ctx) => {
      await ctx.reply(telegramCopy.placeholders.stats, telegramKeyboards.mainMenu());
    });

    bot.command('history', async (ctx) => {
      await ctx.reply(telegramCopy.placeholders.history, telegramKeyboards.mainMenu());
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
      await ctx.reply(telegramCopy.placeholders.event, telegramKeyboards.mainMenu());
    });

    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[2], async (ctx) => {
      await ctx.reply(telegramCopy.placeholders.stats, telegramKeyboards.mainMenu());
    });

    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[3], async (ctx) => {
      await ctx.reply(telegramCopy.placeholders.history, telegramKeyboards.mainMenu());
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

    const result = await this.checkinsFlow.start(user);
    await ctx.reply(telegramCopy.checkin.started);
    await this.replyCheckinResult(ctx, user, result);
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

    if (callbackData === TELEGRAM_CALLBACKS.actionCancel) {
      const state = await this.fsmService.getState(user.id);
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
      const result = await this.checkinsFlow.goBack(user);
      await this.replyCheckinResult(ctx, user, result);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.actionSkip) {
      const result = await this.checkinsFlow.skipCurrentStep(user);
      await this.replyCheckinResult(ctx, user, result);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.consentAccept) {
      const state = await this.fsmService.getState(user.id);

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

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.scorePrefix)) {
      const scoreRaw = callbackData.slice(TELEGRAM_CALLBACKS.scorePrefix.length);
      const result = await this.checkinsFlow.submitScore(user, scoreRaw);
      await this.replyCheckinResult(ctx, user, result);
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
      await this.replyCheckinPromptByState(ctx, result.nextState);
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
      };

      await ctx.reply(formatCheckinConfirmation(confirmation), telegramKeyboards.mainMenu());
      return;
    }

    if (result.status === 'invalid_score') {
      await ctx.reply(telegramCopy.validation.invalidScore);
      const state = await this.fsmService.getState(user.id);
      await this.replyCheckinPromptByState(ctx, state);
      return;
    }

    if (result.status === 'invalid_sleep_hours') {
      await ctx.reply(telegramCopy.validation.invalidSleepHours, telegramKeyboards.sleepHoursActions({ back: true }));
      return;
    }

    if (result.status === 'cannot_back') {
      await ctx.reply(telegramCopy.common.backUnavailable);
      const state = await this.fsmService.getState(user.id);
      await this.replyCheckinPromptByState(ctx, state);
      return;
    }

    await ctx.reply(telegramCopy.common.actionNotAllowed);
  }

  private async replyCheckinPromptByState(ctx: Context, state: FsmState): Promise<void> {
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
      default:
        await ctx.reply(telegramCopy.checkin.repeatedStepPrompt, telegramKeyboards.mainMenu());
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
