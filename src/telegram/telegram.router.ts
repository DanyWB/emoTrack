import { Injectable, Logger } from '@nestjs/common';
import { SleepMode, SummaryPeriodType, type User } from '@prisma/client';
import type { Context, Telegraf } from 'telegraf';

import { AdminService } from '../admin/admin.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ChartsService } from '../charts/charts.service';
import { CheckinsFlowService, type CheckinFlowResult } from '../checkins/checkins.flow';
import { CheckinsService } from '../checkins/checkins.service';
import {
  buildCoreCheckinStates,
  getPreviousCoreCheckinState,
  isCoreCheckinState,
} from '../checkins/checkins.steps';
import { TELEGRAM_CALLBACKS, TELEGRAM_MAIN_MENU_BUTTONS } from '../common/constants/app.constants';
import { formatErrorLogEvent, formatLogEvent, toLogErrorDetails } from '../common/utils/logging.utils';
import { isValidTimeFormat } from '../common/utils/validation.utils';
import { type DailyMetricCatalogKey } from '../daily-metrics/daily-metrics.catalog';
import { EventsFlowService, type EventFlowResult } from '../events/events.flow';
import { FsmService } from '../fsm/fsm.service';
import { FSM_STATES, type CheckinDraftPayload, type FsmState } from '../fsm/fsm.types';
import { OnboardingFlow, type OnboardingStepType } from '../onboarding/onboarding.flow';
import { RemindersService } from '../reminders/reminders.service';
import { SummariesService } from '../summaries/summaries.service';
import { type PeriodStatsPayload, type SelectedMetricStatsPayload, type StatsSelectedMetricKey } from '../stats/stats.types';
import { TagsService } from '../tags/tags.service';
import { UsersService } from '../users/users.service';
import {
  formatCheckinConfirmation,
  formatCheckinTagsSelectionPrompt,
  formatAdminActiveUsersPage,
  formatAdminOverview,
  formatAdminUserButtonLabel,
  formatAdminUserDetail,
  formatAdminUserHistoryTitle,
  formatAdminUserStatsTitle,
  formatDailyMetricsSettingsText,
  formatHistoryEntryDetail,
  formatHistoryEntries,
  formatReminderTimeUpdateMessage,
  formatSettingsText,
  formatStatsMetricPrompt,
  formatStatsSleepChartCaption,
  formatStatsSelectedMetricChartCaption,
  formatStandaloneEventSaved,
  getDailyMetricLabel,
  getCheckinPrompt,
  getExtraMetricCheckinPrompt,
  telegramCopy,
  type CheckinConfirmationData,
  type SettingsMetricOptionData,
} from './telegram.copy';
import { extractTelegramProfile, getCallbackData, normalizeTelegramText } from './telegram.helpers';
import { telegramKeyboards } from './telegram.keyboards';
import {
  buildStatsMetricOptions,
  isAvailableStatsMetricKey,
  type StatsMetricOption,
} from './telegram.stats-options';
import {
  deleteCurrentMessage,
  deleteMessageById,
  editOrReplyHtml,
  getCurrentMessageRef,
  replyHtml,
  type TelegramMessageRef,
} from './telegram.ui';

const HISTORY_PAGE_SIZE = 5;
const HISTORY_ROOT_CURSOR_TOKEN = 'root';
const ADMIN_ACTIVE_USERS_PAGE_SIZE = 5;

interface MessageRenderOptions {
  preferEdit?: boolean;
  cleanupFlowMessages?: boolean;
  trackFlowPromptForUserId?: string;
}

interface AdminUserPeriodCallback {
  userId: string;
  periodType: SummaryPeriodType;
}

interface AdminUserCursorCallback {
  userId: string;
  pageCursorToken: string;
}

interface AdminEntryCallback {
  entryId: string;
  pageCursorToken: string;
}

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
    private readonly adminService: AdminService,
  ) {}

  register(bot: Telegraf<Context>): void {
    bot.start((ctx) => this.runSafely(ctx, () => this.handleStartCommand(ctx), 'start'));
    bot.command('admin', (ctx) => this.runSafely(ctx, () => this.handleAdminCommand(ctx), 'admin'));
    bot.command('menu', (ctx) => this.runSafely(ctx, () => this.handleMenuCommand(ctx), 'menu'));
    bot.command('terms', (ctx) => this.runSafely(ctx, () => this.handleTermsCommand(ctx), 'terms'));
    bot.command('checkin', (ctx) => this.runSafely(ctx, () => this.handleCheckinCommand(ctx), 'checkin'));
    bot.command('event', (ctx) => this.runSafely(ctx, () => this.handleEventCommand(ctx), 'event'));
    bot.command('stats', (ctx) => this.runSafely(ctx, () => this.handleStatsCommand(ctx), 'stats'));
    bot.command('history', (ctx) => this.runSafely(ctx, () => this.handleHistoryCommand(ctx), 'history'));
    bot.command('settings', (ctx) => this.runSafely(ctx, () => this.handleSettingsCommand(ctx), 'settings'));
    bot.command('help', (ctx) => this.runSafely(ctx, () => this.handleHelpCommand(ctx), 'help'));

    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[0], (ctx) => this.runSafely(ctx, () => this.handleCheckinCommand(ctx), 'menu:checkin'));
    bot.hears(TELEGRAM_MAIN_MENU_BUTTONS[1], (ctx) => this.runSafely(ctx, () => this.handleEventCommand(ctx), 'menu:event'));

    bot.on('callback_query', (ctx) => this.runSafely(ctx, () => this.handleCallbackQuery(ctx), 'callback_query'));
    bot.on('text', (ctx) => this.runSafely(ctx, () => this.handleTextMessage(ctx), 'text'));
  }

  private async handleStartCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user) {
      return;
    }

    await this.analyticsService.track('bot_started', {}, user.id);
    await this.replyOnboardingProgress(ctx, user, true);
  }

  private async handleAdminCommand(ctx: Context): Promise<void> {
    if (!(await this.ensureAdminAccess(ctx))) {
      return;
    }

    await replyHtml(ctx, telegramCopy.admin.menu, telegramKeyboards.adminMenu());
  }

  private async handleMenuCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);

    if (user) {
      await this.analyticsService.track('menu_opened', {}, user.id);
    }

    await replyHtml(ctx, telegramCopy.menu.text, telegramKeyboards.navigationMenu());
  }

  private async handleCheckinCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user || !(await this.ensureProductAccess(ctx, user))) {
      return;
    }

    const result = await this.checkinsFlow.start(user);
    await replyHtml(ctx, result.resumed ? telegramCopy.checkin.resumed : telegramCopy.checkin.started);

    if (result.nextState && this.isEventState(result.nextState)) {
      await this.replyEventPromptByState(ctx, user, result.nextState, 'checkin');
      return;
    }

    await this.replyCheckinResult(ctx, user, result);
  }

  private async handleEventCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user || !(await this.ensureProductAccess(ctx, user))) {
      return;
    }

    const result = await this.eventsFlow.startStandalone(user);
    await replyHtml(ctx, telegramCopy.event.startedStandalone);
    await this.replyEventResult(ctx, user, result);
  }

  private async handleStatsCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user || !(await this.ensureProductAccess(ctx, user))) {
      return;
    }

    await this.openStatsMenu(ctx, user);
  }

  private async handleHistoryCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user || !(await this.ensureProductAccess(ctx, user))) {
      return;
    }

    await this.openHistoryMenu(ctx, user);
  }

  private async handleSettingsCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user || !(await this.ensureProductAccess(ctx, user))) {
      return;
    }

    await this.openSettingsMenu(ctx, user);
  }

  private async handleHelpCommand(ctx: Context): Promise<void> {
    await this.replyHelp(ctx);
  }

  private async handleTermsCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user) {
      return;
    }

    await this.openTerms(ctx, user);
  }

  private async openTerms(ctx: Context, user: User, options: MessageRenderOptions = {}): Promise<void> {
    const lines = [`<b>${telegramCopy.terms.title}</b>`, '', telegramCopy.terms.text];

    if (!user.consentGiven) {
      await this.fsmService.setState(user.id, FSM_STATES.onboarding_consent, {});
      lines.push('', `<i>${telegramCopy.terms.acceptPrompt}</i>`);
      await this.sendHtml(ctx, lines.join('\n'), telegramKeyboards.consent(), options);
      return;
    }

    lines.push('', telegramCopy.terms.alreadyAccepted);
    await this.sendHtml(
      ctx,
      lines.join('\n'),
      options.preferEdit ? telegramKeyboards.navigationMenu() : telegramKeyboards.mainMenu(),
      options,
    );
  }

  private async sendHtml(
    ctx: Context,
    text: string,
    extra?: Parameters<typeof replyHtml>[2],
    options: MessageRenderOptions = {},
  ): Promise<void> {
    if (options.cleanupFlowMessages && options.trackFlowPromptForUserId) {
      await this.cleanupTrackedFlowMessages(ctx, options.trackFlowPromptForUserId);
    }

    let sentMessage: TelegramMessageRef | undefined;

    if (options.preferEdit) {
      sentMessage = await editOrReplyHtml(ctx, text, extra);
    } else {
      sentMessage = await replyHtml(ctx, text, extra);
    }

    if (options.trackFlowPromptForUserId) {
      await this.rememberFlowPromptMessage(ctx, options.trackFlowPromptForUserId, sentMessage);
    }
  }

  private withFlowPromptTracking(userId: string, options: MessageRenderOptions = {}): MessageRenderOptions {
    return {
      ...options,
      trackFlowPromptForUserId: userId,
    };
  }

  private withFlowMessageCleanup(userId: string, options: MessageRenderOptions = {}): MessageRenderOptions {
    return {
      ...options,
      cleanupFlowMessages: true,
      trackFlowPromptForUserId: userId,
    };
  }

  private async cleanupTrackedFlowMessages(ctx: Context, userId: string): Promise<void> {
    const payload = await this.getSessionPayload(userId);

    if (typeof payload.telegramPromptMessageId === 'number') {
      await deleteMessageById(ctx, payload.telegramPromptMessageId);
    }

    await deleteCurrentMessage(ctx);
    await this.fsmService.updatePayload(userId, { telegramPromptMessageId: null });
  }

  private async rememberFlowPromptMessage(
    ctx: Context,
    userId: string,
    sentMessage?: TelegramMessageRef,
  ): Promise<void> {
    const messageId = sentMessage?.message_id ?? getCurrentMessageRef(ctx)?.message_id;

    if (typeof messageId !== 'number') {
      return;
    }

    await this.fsmService.updatePayload(userId, { telegramPromptMessageId: messageId });
  }

  private async returnToNavigationMenu(ctx: Context, options: MessageRenderOptions = {}): Promise<void> {
    await this.sendHtml(
      ctx,
      telegramCopy.menu.text,
      options.preferEdit ? telegramKeyboards.navigationMenu() : telegramKeyboards.mainMenu(),
      options,
    );
  }

  private async replyNavigationMenu(ctx: Context, text = telegramCopy.menu.text): Promise<void> {
    await replyHtml(ctx, text, telegramKeyboards.navigationMenu());
  }

  private async openStatsMenu(ctx: Context, user: User, options: MessageRenderOptions = {}): Promise<void> {
    await this.fsmService.setState(user.id, FSM_STATES.stats_period_select, {});
    await this.analyticsService.track('stats_requested', {}, user.id);
    this.logger.log(`Opened stats period selector for user ${user.id}`);
    await this.replyStatsPeriodSelector(ctx, options);
  }

  private async openHistoryMenu(ctx: Context, user: User, options: MessageRenderOptions = {}): Promise<void> {
    await this.analyticsService.track('history_requested', {}, user.id);
    await this.replyHistoryPage(ctx, user.id, undefined, 'initial', options);
  }

  private async openSettingsMenu(ctx: Context, user: User, options: MessageRenderOptions = {}): Promise<void> {
    await this.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });
    await this.analyticsService.track('settings_opened', {}, user.id);
    await this.replySettingsMenu(ctx, user, options);
  }

  private async replyHelp(ctx: Context, options: MessageRenderOptions = {}): Promise<void> {
    if (options.preferEdit) {
      await editOrReplyHtml(ctx, telegramCopy.help.text, telegramKeyboards.navigationMenu());
      return;
    }

    await replyHtml(ctx, telegramCopy.help.text, telegramKeyboards.mainMenu());
  }

  private async handleAdminCallback(ctx: Context, callbackData: string): Promise<void> {
    if (!(await this.ensureAdminAccess(ctx))) {
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.adminMenu) {
      await editOrReplyHtml(ctx, telegramCopy.admin.menu, telegramKeyboards.adminMenu());
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.adminOverview) {
      await this.replyAdminOverview(ctx);
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.adminActiveUsersPrefix)) {
      const offset = this.parseAdminOffset(callbackData.slice(TELEGRAM_CALLBACKS.adminActiveUsersPrefix.length));
      await this.replyAdminActiveUsers(ctx, offset);
      return;
    }

    const adminStatsPayload = this.parseAdminUserStatsCallback(callbackData);

    if (adminStatsPayload) {
      await this.replyAdminUserStats(ctx, adminStatsPayload.userId, adminStatsPayload.periodType);
      return;
    }

    const adminHistoryPayload = this.parseAdminUserHistoryCallback(callbackData);

    if (adminHistoryPayload) {
      await this.replyAdminUserHistory(ctx, adminHistoryPayload.userId, adminHistoryPayload.pageCursorToken);
      return;
    }

    const adminEntryPayload = this.parseAdminEntryCallback(callbackData);

    if (adminEntryPayload) {
      await this.replyAdminHistoryDetail(ctx, adminEntryPayload.entryId, adminEntryPayload.pageCursorToken);
      return;
    }

    const adminHistoryBackPayload = this.parseAdminHistoryBackCallback(callbackData);

    if (adminHistoryBackPayload) {
      await this.replyAdminUserHistory(
        ctx,
        adminHistoryBackPayload.userId,
        adminHistoryBackPayload.pageCursorToken,
      );
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.adminUserPrefix)) {
      const userId = callbackData.slice(TELEGRAM_CALLBACKS.adminUserPrefix.length);
      await this.replyAdminUserDetail(ctx, userId);
    }
  }

  private async ensureAdminAccess(ctx: Context): Promise<boolean> {
    if (this.adminService.isAdminTelegramId(ctx.from?.id)) {
      return true;
    }

    await replyHtml(ctx, telegramCopy.admin.accessDenied, telegramKeyboards.mainMenu());
    return false;
  }

  private isAdminCallback(callbackData: string): boolean {
    return (
      callbackData === TELEGRAM_CALLBACKS.adminMenu ||
      callbackData === TELEGRAM_CALLBACKS.adminOverview ||
      callbackData.startsWith(TELEGRAM_CALLBACKS.adminActiveUsersPrefix) ||
      callbackData.startsWith(TELEGRAM_CALLBACKS.adminUserPrefix) ||
      callbackData.startsWith(TELEGRAM_CALLBACKS.adminUserStatsPrefix) ||
      callbackData.startsWith(TELEGRAM_CALLBACKS.adminUserHistoryPrefix) ||
      callbackData.startsWith(TELEGRAM_CALLBACKS.adminEntryOpenPrefix) ||
      callbackData.startsWith(TELEGRAM_CALLBACKS.adminHistoryBackPrefix)
    );
  }

  private async replyAdminOverview(ctx: Context): Promise<void> {
    const overview = await this.adminService.getOverview();
    await editOrReplyHtml(ctx, formatAdminOverview(overview), telegramKeyboards.adminOverview());
  }

  private async replyAdminActiveUsers(ctx: Context, offset: number): Promise<void> {
    const page = await this.adminService.listActiveUsers({
      offset,
      limit: ADMIN_ACTIVE_USERS_PAGE_SIZE,
    });

    await editOrReplyHtml(
      ctx,
      formatAdminActiveUsersPage(page),
      telegramKeyboards.adminActiveUsers(
        page.items.map((item) => ({
          userId: item.user.id,
          label: formatAdminUserButtonLabel(item),
        })),
        {
          offset: page.offset,
          limit: page.limit,
          hasPrevious: page.hasPrevious,
          hasNext: page.hasNext,
        },
      ),
    );
  }

  private async replyAdminUserDetail(ctx: Context, userId: string): Promise<void> {
    const detail = await this.adminService.getUserDetail(userId);

    if (!detail) {
      await editOrReplyHtml(ctx, telegramCopy.admin.userNotFound, telegramKeyboards.adminMenu());
      return;
    }

    await editOrReplyHtml(ctx, formatAdminUserDetail(detail), telegramKeyboards.adminUserDetail(userId));
  }

  private async replyAdminUserStats(
    ctx: Context,
    userId: string,
    periodType: SummaryPeriodType,
  ): Promise<void> {
    const detail = await this.adminService.getUserDetail(userId);

    if (!detail) {
      await editOrReplyHtml(ctx, telegramCopy.admin.userNotFound, telegramKeyboards.adminMenu());
      return;
    }

    await editOrReplyHtml(ctx, telegramCopy.admin.statsLoading, telegramKeyboards.adminUserDetail(userId));

    const payload = await this.summariesService.generateSummary(userId, periodType, {
      timezone: detail.user.timezone,
      persist: false,
    });
    const text = `${formatAdminUserStatsTitle(detail.user, periodType)}\n\n${this.summariesService.formatSummaryText(payload)}`;

    await editOrReplyHtml(ctx, text, telegramKeyboards.adminUserDetail(userId));

    if (payload.entriesCount === 0 || payload.isLowData) {
      return;
    }

    await this.sendStatsCharts(ctx, detail.user, payload);
  }

  private async replyAdminUserHistory(
    ctx: Context,
    userId: string,
    pageCursorToken: string,
  ): Promise<void> {
    const detail = await this.adminService.getUserDetail(userId);

    if (!detail) {
      await editOrReplyHtml(ctx, telegramCopy.admin.userNotFound, telegramKeyboards.adminMenu());
      return;
    }

    const cursor = this.decodeHistoryPageCursor(pageCursorToken);
    const page = await this.checkinsService.getRecentEntriesPage(userId, HISTORY_PAGE_SIZE, cursor);

    if (page.staleCursor) {
      await editOrReplyHtml(ctx, telegramCopy.history.stale, telegramKeyboards.adminUserDetail(userId));
      return;
    }

    if (page.entries.length === 0) {
      await editOrReplyHtml(ctx, telegramCopy.admin.historyEmpty, telegramKeyboards.adminUserDetail(userId));
      return;
    }

    const text = [
      formatAdminUserHistoryTitle(detail.user),
      '',
      formatHistoryEntries(page.entries, { title: telegramCopy.history.title }),
    ].join('\n');

    await editOrReplyHtml(
      ctx,
      text,
      telegramKeyboards.adminHistoryPage(
        page.entries.map((entry) => ({
          id: entry.id,
          entryDate: entry.entryDate,
        })),
        userId,
        this.encodeHistoryPageCursor(cursor),
        page.nextCursor,
      ),
    );
  }

  private async replyAdminHistoryDetail(
    ctx: Context,
    entryId: string,
    pageCursorToken: string,
  ): Promise<void> {
    const userId = await this.adminService.findEntryOwnerUserId(entryId);

    if (!userId) {
      await editOrReplyHtml(ctx, telegramCopy.admin.userNotFound, telegramKeyboards.adminMenu());
      return;
    }

    const detail = await this.checkinsService.getHistoryEntryDetail(userId, entryId);

    if (!detail) {
      await editOrReplyHtml(ctx, telegramCopy.admin.userNotFound, telegramKeyboards.adminUserDetail(userId));
      return;
    }

    await editOrReplyHtml(
      ctx,
      formatHistoryEntryDetail(detail),
      telegramKeyboards.adminHistoryDetail(userId, pageCursorToken),
    );
  }

  private async handleCallbackQuery(ctx: Context): Promise<void> {
    const callbackData = getCallbackData(ctx);
    if (!callbackData) {
      return;
    }

    await ctx.answerCbQuery().catch(() => undefined);

    if (this.isAdminCallback(callbackData)) {
      await this.handleAdminCallback(ctx, callbackData);
      return;
    }

    const user = await this.getOrCreateUserFromContext(ctx);
    if (!user) {
      return;
    }

    const state = await this.fsmService.getState(user.id);

    if (!user.consentGiven && !this.isAllowedPreConsentCallback(callbackData)) {
      await this.replyPreConsentRedirect(ctx, user);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.menuStats) {
      if (!(await this.ensureProductAccess(ctx, user))) {
        return;
      }

      await this.openStatsMenu(ctx, user, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.menuHistory) {
      if (!(await this.ensureProductAccess(ctx, user))) {
        return;
      }

      await this.openHistoryMenu(ctx, user, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.menuSettings) {
      if (!(await this.ensureProductAccess(ctx, user))) {
        return;
      }

      await this.openSettingsMenu(ctx, user, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.menuHelp) {
      await this.replyHelp(ctx, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.menuTerms) {
      await this.openTerms(ctx, user, { preferEdit: true });
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.historyMorePrefix)) {
      const cursor = callbackData.slice(TELEGRAM_CALLBACKS.historyMorePrefix.length);
      await this.handleHistoryMoreCallback(ctx, user.id, cursor);
      return;
    }

    const historyOpenPayload = this.parseHistoryOpenCallback(callbackData);

    if (historyOpenPayload) {
      await this.handleHistoryOpenCallback(
        ctx,
        user.id,
        historyOpenPayload.entryId,
        historyOpenPayload.pageCursorToken,
      );
      return;
    }

    const historyBackPayload = this.parseHistoryBackCallback(callbackData);

    if (historyBackPayload) {
      await this.handleHistoryBackCallback(ctx, user.id, historyBackPayload.pageCursorToken);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.actionCancel) {
      if (state === FSM_STATES.onboarding_consent) {
        await this.onboardingFlow.cancel(user.id);
        await deleteCurrentMessage(ctx);
        await replyHtml(ctx, telegramCopy.onboarding.consentDeclined, telegramKeyboards.mainMenu());
        return;
      }

      if (this.isOnboardingState(state)) {
        await this.onboardingFlow.cancel(user.id);
        await deleteCurrentMessage(ctx);
        await replyHtml(ctx, telegramCopy.common.cancelledToMenu, telegramKeyboards.mainMenu());
        return;
      }

      if (this.isCheckinState(state) || this.isEventState(state)) {
        await this.checkinsFlow.cancel(user.id);
        await this.returnToNavigationMenu(ctx, { preferEdit: true });
        return;
      }

      if (state === FSM_STATES.settings_menu || this.isStatsState(state)) {
        await this.fsmService.setIdle(user.id);
        await this.returnToNavigationMenu(ctx, { preferEdit: true });
        return;
      }

      await this.returnToNavigationMenu(ctx, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.actionBack) {
      if (state === FSM_STATES.stats_metric_select) {
        await this.fsmService.setState(user.id, FSM_STATES.stats_period_select, {});
        await this.replyStatsPeriodSelector(ctx, { preferEdit: true });
        return;
      }

      if (state === FSM_STATES.settings_menu) {
        const payload = await this.getSessionPayload(user.id);
        if (payload.settingsAwaiting === 'sleep_mode') {
          await this.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });
          await this.replySettingsMenu(ctx, user, { preferEdit: true });
          return;
        }

        if (payload.settingsAwaiting === 'reminder_time') {
          await this.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });
          await this.replySettingsMenu(ctx, user, { preferEdit: true });
          return;
        }

        if (payload.settingsView === 'daily_metrics') {
          await this.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });
          await this.replySettingsMenu(ctx, user, { preferEdit: true });
          return;
        }
      }

      if (this.isEventState(state)) {
        const result = await this.eventsFlow.goBack(user);
        await this.replyEventResult(ctx, user, result, { preferEdit: true });
        return;
      }

      const result = await this.checkinsFlow.goBack(user);
      await this.replyCheckinResult(ctx, user, result, {
        preferEdit: this.shouldEditCheckinCallbackScreen(state),
      });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.actionSkip) {
      if (state === FSM_STATES.event_description) {
        const result = await this.eventsFlow.skipDescription(user);
        await this.replyEventResult(ctx, user, result, { preferEdit: true });
        return;
      }

      if (state === FSM_STATES.event_end_date) {
        const result = await this.eventsFlow.skipEndDate(user);
        await this.replyEventResult(ctx, user, result, { preferEdit: true });
        return;
      }

      if (state === FSM_STATES.checkin_add_event_confirm) {
        const result = await this.checkinsFlow.finalizeAfterEventSkip(user);
        await this.replyCheckinResult(ctx, user, result, { preferEdit: true });
        return;
      }

      const result = await this.checkinsFlow.skipCurrentStep(user);
      await this.replyCheckinResult(ctx, user, result, { preferEdit: true });
      return;
    }
    if (callbackData === TELEGRAM_CALLBACKS.consentAccept) {
      if (state !== FSM_STATES.onboarding_consent) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      await this.onboardingFlow.acceptConsent(user);
      await this.replyOnboardingStep(ctx, 'ask_reminder_time', false, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.onboardingReminderLater) {
      if (state !== FSM_STATES.onboarding_reminder_time) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      const result = await this.onboardingFlow.skipReminderTime(user);
      await this.replyOnboardingStep(ctx, result.step, false, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.onboardingStartFirstCheckin) {
      await this.onboardingFlow.finishFirstCheckinOffer(user.id);
      const result = await this.checkinsFlow.start(user);
      await this.fsmService.updatePayload(user.id, { showMenuAfterSave: true });
      await this.replyCheckinResult(ctx, user, result, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.onboardingLater) {
      await this.onboardingFlow.finishFirstCheckinOffer(user.id);
      await deleteCurrentMessage(ctx);
      await replyHtml(ctx, telegramCopy.onboarding.firstCheckinDeferred, telegramKeyboards.mainMenu());
      await this.replyNavigationMenu(ctx);
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.checkinNoteAdd) {
      const result = await this.checkinsFlow.beginNoteStep(user);
      await this.replyCheckinResult(ctx, user, result, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.checkinTagsStart) {
      const result = await this.checkinsFlow.startTagsSelection(user);
      await this.replyCheckinResult(ctx, user, result, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.checkinTagsDone) {
      const result = await this.checkinsFlow.confirmTags(user);
      await this.replyCheckinResult(ctx, user, result, { preferEdit: true });
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.checkinTagsTogglePrefix)) {
      const tagId = callbackData.slice(TELEGRAM_CALLBACKS.checkinTagsTogglePrefix.length);
      const result = await this.checkinsFlow.toggleTagSelection(user, tagId);
      await this.replyCheckinResult(ctx, user, result, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.checkinEventAdd) {
      const result = await this.eventsFlow.startFromCheckin(user);
      await this.replyEventResult(ctx, user, result, { preferEdit: true });
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.eventTypePrefix)) {
      const eventType = callbackData.slice(TELEGRAM_CALLBACKS.eventTypePrefix.length);
      const result = await this.eventsFlow.submitType(user, eventType);
      await this.replyEventResult(ctx, user, result, { preferEdit: true });
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.eventRepeatModePrefix)) {
      const repeatMode = callbackData.slice(TELEGRAM_CALLBACKS.eventRepeatModePrefix.length);
      const result = await this.eventsFlow.submitRepeatMode(user, repeatMode);
      await this.replyEventResult(ctx, user, result, { preferEdit: true });
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.eventRepeatCountPrefix)) {
      const repeatCount = callbackData.slice(TELEGRAM_CALLBACKS.eventRepeatCountPrefix.length);
      const result = await this.eventsFlow.submitRepeatCount(user, repeatCount);
      await this.replyEventResult(ctx, user, result, { preferEdit: true });
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

      await this.handleStatsPeriodSelection(ctx, user, periodType, { preferEdit: true });
      return;
    }

    const statsMetricKey = this.parseStatsMetricCallback(callbackData);

    if (statsMetricKey) {
      if (state !== FSM_STATES.stats_metric_select) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      const payload = await this.getSessionPayload(user.id);
      const periodType = this.parseSummaryPeriod(payload.statsPeriodType ?? '');

      if (!periodType) {
        await this.fsmService.setState(user.id, FSM_STATES.stats_period_select, {});
        await this.replyStatsPeriodSelector(ctx, { preferEdit: true });
        return;
      }

      const metricOptions = await this.getStatsMetricOptions(user.id);

      if (!isAvailableStatsMetricKey(statsMetricKey, metricOptions)) {
        await this.fsmService.setState(user.id, FSM_STATES.stats_metric_select, {
          statsPeriodType: periodType,
        });
        await ctx.reply(telegramCopy.stats.metricUnavailable);
        await this.replyStatsMetricSelector(ctx, user, periodType, { preferEdit: true });
        return;
      }

      await this.handleStatsMetricSelection(ctx, user, periodType, statsMetricKey);
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

      await this.replySettingsMenu(ctx, updatedUser, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.settingsDailyMetricsOpen) {
      if (state !== FSM_STATES.settings_menu) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      await this.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'daily_metrics' });
      await this.replyDailyMetricsMenu(ctx, user.id, { preferEdit: true });
      return;
    }

    const dailyMetricKey = this.parseDailyMetricCallback(callbackData);

    if (dailyMetricKey) {
      if (state !== FSM_STATES.settings_menu) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      const payload = await this.getSessionPayload(user.id);

      if (payload.settingsView !== 'daily_metrics') {
        await this.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'daily_metrics' });
        await ctx.reply(telegramCopy.settings.dailyMetricsStale);
        await this.replyDailyMetricsMenu(ctx, user.id, { preferEdit: true });
        return;
      }

      const updatedUser = await this.updateTrackedMetricSetting(ctx, user, dailyMetricKey);

      if (!updatedUser) {
        await this.replyDailyMetricsMenu(ctx, user.id, { preferEdit: true });
        return;
      }

      await this.replyDailyMetricsMenu(ctx, updatedUser.id, { preferEdit: true });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.settingsReminderTimeEdit) {
      if (state !== FSM_STATES.settings_menu) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      await this.fsmService.setState(user.id, FSM_STATES.settings_menu, {
        settingsAwaiting: 'reminder_time',
        settingsView: 'main',
      });
      await this.sendHtml(ctx, telegramCopy.settings.reminderTimePrompt, telegramKeyboards.backOnly(), {
        preferEdit: true,
      });
      return;
    }

    if (callbackData === TELEGRAM_CALLBACKS.settingsSleepModeSelect) {
      if (state !== FSM_STATES.settings_menu) {
        await ctx.reply(telegramCopy.common.actionNotAllowed);
        return;
      }

      await this.fsmService.setState(user.id, FSM_STATES.settings_menu, {
        settingsAwaiting: 'sleep_mode',
        settingsView: 'main',
      });
      await this.sendHtml(ctx, telegramCopy.settings.sleepModePrompt, telegramKeyboards.settingsSleepMode(), {
        preferEdit: true,
      });
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
      await this.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });
      await this.analyticsService.track('settings_updated', { field: 'sleepMode', value: sleepMode }, user.id);

      await this.replySettingsMenu(ctx, updatedUser, { preferEdit: true });
      return;
    }

    if (callbackData.startsWith(TELEGRAM_CALLBACKS.scorePrefix)) {
      const scoreRaw = callbackData.slice(TELEGRAM_CALLBACKS.scorePrefix.length);

      if (state === FSM_STATES.event_score) {
        const eventResult = await this.eventsFlow.submitScore(user, scoreRaw);
        await this.replyEventResult(ctx, user, eventResult, { preferEdit: true });
        return;
      }

      const checkinResult = await this.checkinsFlow.submitScore(user, scoreRaw);
      await this.replyCheckinResult(ctx, user, checkinResult, { preferEdit: true });
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
        await replyHtml(ctx, telegramCopy.onboarding.consentPrompt, telegramKeyboards.consent());
        return;
      case FSM_STATES.onboarding_first_checkin:
        await replyHtml(ctx, telegramCopy.onboarding.firstCheckinOffer, telegramKeyboards.onboardingFirstCheckin());
        return;
      case FSM_STATES.checkin_mood:
      case FSM_STATES.checkin_energy:
      case FSM_STATES.checkin_stress:
      case FSM_STATES.checkin_metric_score:
      case FSM_STATES.checkin_sleep_quality: {
        const result = await this.checkinsFlow.submitScore(user, text);
        await this.replyCheckinResult(ctx, user, result, this.withFlowMessageCleanup(user.id));
        return;
      }
      case FSM_STATES.checkin_sleep_hours: {
        const result = await this.checkinsFlow.submitSleepHours(user, text);
        await this.replyCheckinResult(ctx, user, result, this.withFlowMessageCleanup(user.id));
        return;
      }
      case FSM_STATES.checkin_note: {
        const result = await this.checkinsFlow.submitNote(user, text);
        await this.replyCheckinResult(ctx, user, result, this.withFlowMessageCleanup(user.id));
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
      case FSM_STATES.event_end_date:
      case FSM_STATES.event_repeat_mode:
      case FSM_STATES.event_repeat_count:
        await this.handleEventTextByState(ctx, user, state, text);
        return;
      case FSM_STATES.settings_menu:
        await this.handleSettingsTextInput(ctx, user, text);
        return;
      case FSM_STATES.stats_period_select:
        await this.replyStatsPeriodSelector(ctx);
        return;
      case FSM_STATES.stats_metric_select:
        await this.replyStatsMetricSelector(ctx, user, await this.getStatsPeriodFromSession(user.id));
        return;
      default:
        break;
    }

    if (!user.onboardingCompleted) {
      if (!user.consentGiven) {
        await this.replyPreConsentRedirect(ctx, user);
        return;
      }

      await ctx.reply(telegramCopy.onboarding.incompleteRedirect);
      await this.replyOnboardingProgress(ctx, user, false);
      return;
    }

    await ctx.reply(telegramCopy.startup.unknownInput, telegramKeyboards.mainMenu());
  }

  private async handleStatsPeriodSelection(
    ctx: Context,
    user: User,
    periodType: SummaryPeriodType,
    options: MessageRenderOptions = {},
  ): Promise<void> {
    await this.fsmService.setState(user.id, FSM_STATES.stats_metric_select, {
      statsPeriodType: periodType,
    });
    await this.replyStatsMetricSelector(ctx, user, periodType, options);
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

      if (charts.moodHeatStripBuffer) {
        await ctx.replyWithPhoto(
          { source: charts.moodHeatStripBuffer },
          { caption: telegramCopy.stats.chartMoodStripCaption },
        );
      }

      if (charts.combinedChartBuffer || charts.sleepChartBuffer || charts.moodHeatStripBuffer) {
        await this.analyticsService.track(
          'chart_generated',
          {
            combined: !!charts.combinedChartBuffer,
            sleep: !!charts.sleepChartBuffer,
            moodStrip: !!charts.moodHeatStripBuffer,
          },
          user.id,
        );
      }
    } catch (error) {
      const err = toLogErrorDetails(error);
      this.logger.warn(formatErrorLogEvent('stats_chart_generation_failed', error, {
        userId: user.id,
        periodType: payload.periodType,
        entriesCount: payload.entriesCount,
        chartPointsCount: payload.chartPoints.length,
      }));
      await this.analyticsService.track('chart_generation_failed', { reason: err.message }, user.id);
      await ctx.reply(telegramCopy.stats.chartUnavailable);
    }
  }

  private async handleStatsMetricSelection(
    ctx: Context,
    user: User,
    periodType: SummaryPeriodType,
    metricKey: StatsSelectedMetricKey,
  ): Promise<void> {
    await this.analyticsService.track('summary_requested', { periodType, metricKey }, user.id);
    await ctx.reply(telegramCopy.stats.loading);

    const payload = await this.summariesService.generateSelectedMetricSummary(user.id, periodType, metricKey, {
      timezone: user.timezone,
      persist: true,
    });

    if (payload.entriesCount === 0) {
      await this.fsmService.setIdle(user.id);
      await ctx.reply(telegramCopy.stats.empty, telegramKeyboards.mainMenu());
      return;
    }

    await ctx.reply(this.summariesService.formatSelectedMetricSummaryText(payload), telegramKeyboards.mainMenu());
    await this.analyticsService.track('summary_sent', { periodType, metricKey }, user.id);

    if (payload.isLowData) {
      this.logger.log(`Skipped selected-metric chart for user ${user.id} due to low-data stats payload.`);
      await this.fsmService.setIdle(user.id);
      return;
    }

    await this.sendSelectedMetricChart(ctx, user, payload);
    await this.fsmService.setIdle(user.id);
  }

  private async sendSelectedMetricChart(
    ctx: Context,
    user: User,
    payload: SelectedMetricStatsPayload,
  ): Promise<void> {
    try {
      if (payload.metricKind === 'sleep_block') {
        const hasSleepData = payload.sleepChartPoints.some(
          (point) => typeof point.sleepHours === 'number' || typeof point.sleepQuality === 'number',
        );

        if (!hasSleepData) {
          return;
        }

        const sleepChartBuffer = await this.chartsService.renderSleepChart(payload.sleepChartPoints);
        await ctx.replyWithPhoto(
          { source: sleepChartBuffer },
          { caption: formatStatsSleepChartCaption(payload.periodType) },
        );
        await this.analyticsService.track('chart_generated', { metricKey: payload.metricKey, sleep: true }, user.id);
        return;
      }

      const chartBuffer = await this.chartsService.generateSelectedMetricChart(payload.chartPoints, {
        label: payload.metricLabel,
        color: this.resolveStatsMetricChartColor(payload.metricKey),
      });

      if (!chartBuffer) {
        return;
      }

      await ctx.replyWithPhoto(
        { source: chartBuffer },
        { caption: formatStatsSelectedMetricChartCaption(payload.metricLabel, payload.periodType) },
      );
      await this.analyticsService.track('chart_generated', { metricKey: payload.metricKey, combined: true }, user.id);
    } catch (error) {
      const err = toLogErrorDetails(error);
      this.logger.warn(formatErrorLogEvent('stats_selected_metric_chart_generation_failed', error, {
        userId: user.id,
        periodType: payload.periodType,
        metricKey: payload.metricKey,
        metricKind: payload.metricKind,
        chartPointsCount: payload.chartPoints.length,
        sleepChartPointsCount: payload.sleepChartPoints.length,
      }));
      await this.analyticsService.track('chart_generation_failed', { reason: err.message, metricKey: payload.metricKey }, user.id);
      await ctx.reply(telegramCopy.stats.chartUnavailable);
    }
  }

  private async handleSettingsTextInput(ctx: Context, user: User, text: string): Promise<void> {
    const payload = await this.getSessionPayload(user.id);

    if (payload.settingsAwaiting !== 'reminder_time') {
      if (payload.settingsView === 'daily_metrics') {
        await this.replyDailyMetricsMenu(ctx, user.id);
        return;
      }

      await this.replySettingsMenu(ctx, user);
      return;
    }

    if (!isValidTimeFormat(text)) {
      await ctx.reply(telegramCopy.validation.invalidTime, telegramKeyboards.backOnly());
      return;
    }

    const updatedUser = await this.usersService.setReminderTime(user.id, text);

    if (updatedUser.remindersEnabled) {
      await this.remindersService.rescheduleDailyReminder(user.id);
    }

    await this.fsmService.setState(user.id, FSM_STATES.settings_menu, { settingsView: 'main' });
    await this.analyticsService.track('settings_updated', { field: 'reminderTime', value: text }, user.id);

    await ctx.reply(
      formatReminderTimeUpdateMessage(
        updatedUser.remindersEnabled,
        this.remindersService.isBackgroundDeliveryAvailable(),
      ),
    );
    await this.replySettingsMenu(ctx, updatedUser);
  }

  private async handleEventTextByState(
    ctx: Context,
    user: User,
    state: FsmState,
    text: string,
  ): Promise<void> {
    if (state === FSM_STATES.event_type) {
      await this.replyEventPromptByState(ctx, user, state, undefined, this.withFlowMessageCleanup(user.id));
      return;
    }

    if (state === FSM_STATES.event_title) {
      const result = await this.eventsFlow.submitTitle(user, text);
      await this.replyEventResult(ctx, user, result, this.withFlowMessageCleanup(user.id));
      return;
    }

    if (state === FSM_STATES.event_score) {
      const result = await this.eventsFlow.submitScore(user, text);
      await this.replyEventResult(ctx, user, result, this.withFlowMessageCleanup(user.id));
      return;
    }

    if (state === FSM_STATES.event_end_date) {
      const result = await this.eventsFlow.submitEndDate(user, text);
      await this.replyEventResult(ctx, user, result, this.withFlowMessageCleanup(user.id));
      return;
    }

    if (state === FSM_STATES.event_repeat_mode) {
      const result = await this.eventsFlow.submitRepeatMode(user, text);
      await this.replyEventResult(ctx, user, result, this.withFlowMessageCleanup(user.id));
      return;
    }

    if (state === FSM_STATES.event_repeat_count) {
      const result = await this.eventsFlow.submitRepeatCount(user, text);
      await this.replyEventResult(ctx, user, result, this.withFlowMessageCleanup(user.id));
      return;
    }

    const result = await this.eventsFlow.submitDescription(user, text);
    await this.replyEventResult(ctx, user, result, this.withFlowMessageCleanup(user.id));
  }

  private async handleReminderTimeInput(ctx: Context, user: User, reminderTime: string): Promise<void> {
    const result = await this.onboardingFlow.submitReminderTime(user, reminderTime);

    if (result.step === 'invalid_reminder_time') {
      await ctx.reply(telegramCopy.validation.invalidTime, telegramKeyboards.onboardingReminderTime());
      return;
    }

    await replyHtml(ctx, telegramCopy.onboarding.reminderSaved);
    await this.replyOnboardingStep(ctx, result.step, false);
  }

  private async replyOnboardingStep(
    ctx: Context,
    step: OnboardingStepType,
    includeIntro: boolean,
    options: MessageRenderOptions = {},
  ): Promise<void> {
    if (step === 'already_ready') {
      await this.sendHtml(ctx, telegramCopy.startup.alreadyReady, telegramKeyboards.navigationMenu(), options);
      return;
    }

    if (step === 'ask_consent') {
      const text = includeIntro
        ? [
            telegramCopy.onboarding.intro,
            '',
            telegramCopy.onboarding.disclaimer,
            '',
            telegramCopy.onboarding.consentPrompt,
          ].join('\n')
        : telegramCopy.onboarding.consentPrompt;

      await this.sendHtml(ctx, text, telegramKeyboards.consent(), options);
      return;
    }

    if (step === 'ask_reminder_time') {
      await this.sendHtml(ctx, telegramCopy.onboarding.reminderPrompt, telegramKeyboards.onboardingReminderTime(), options);
      return;
    }

    if (step === 'invalid_reminder_time') {
      await ctx.reply(telegramCopy.validation.invalidTime, telegramKeyboards.onboardingReminderTime());
      return;
    }

    await this.sendHtml(ctx, telegramCopy.onboarding.firstCheckinOffer, telegramKeyboards.onboardingFirstCheckin(), options);
  }

  private async replyCheckinResult(
    ctx: Context,
    user: User,
    result: CheckinFlowResult,
    options: MessageRenderOptions = {},
  ): Promise<void> {
    if (result.status === 'next' && result.nextState) {
      await this.replyCheckinPromptByState(ctx, user, result.nextState, result.selectedTagIds, options);
      return;
    }

    if (result.status === 'saved' && result.entryPayload) {
      if (options.cleanupFlowMessages) {
        await this.cleanupTrackedFlowMessages(ctx, user.id);
      } else if (options.preferEdit) {
        const deleted = await deleteCurrentMessage(ctx);

        if (!deleted) {
          await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
        }
      }

      const confirmation: CheckinConfirmationData = {
        moodScore: result.entryPayload.moodScore,
        energyScore: result.entryPayload.energyScore,
        stressScore: result.entryPayload.stressScore,
        sleepHours: result.entryPayload.sleepHours,
        sleepQuality: result.entryPayload.sleepQuality,
        extraMetricScores: this.buildConfirmationExtraMetricScores(result.entryPayload.metricValues),
        updated: result.isUpdate ?? false,
        noteAdded: result.noteAdded,
        tagsCount: result.tagsCount,
        eventAdded: result.eventAdded,
      };

      await replyHtml(ctx, formatCheckinConfirmation(confirmation), telegramKeyboards.mainMenu());
      if (result.showMenuAfterSave) {
        await this.replyNavigationMenu(ctx);
      }
      return;
    }

    if (result.status === 'invalid_score') {
      await ctx.reply(telegramCopy.validation.invalidScore);
      const state = await this.fsmService.getState(user.id);
      await this.replyCheckinPromptByState(ctx, user, state);
      return;
    }

    if (result.status === 'invalid_sleep_hours') {
      await ctx.reply(telegramCopy.validation.invalidSleepHours);
      const state = await this.fsmService.getState(user.id);
      await this.replyCheckinPromptByState(ctx, user, state);
      return;
    }

    if (result.status === 'cannot_skip') {
      await ctx.reply(telegramCopy.validation.missingDailyMetricValue);
      const state = await this.fsmService.getState(user.id);
      await this.replyCheckinPromptByState(ctx, user, state);
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

    if (result.status === 'not_in_checkin' || result.status === 'missing_context') {
      await this.fsmService.setIdle(user.id);
      await ctx.reply(telegramCopy.checkin.interrupted, telegramKeyboards.mainMenu());
      return;
    }

    await ctx.reply(telegramCopy.common.actionNotAllowed);
  }

  private async replyEventResult(
    ctx: Context,
    user: User,
    result: EventFlowResult,
    options: MessageRenderOptions = {},
  ): Promise<void> {
    if (result.status === 'next' && result.nextState) {
      await this.replyEventPromptByState(ctx, user, result.nextState, result.source, options);
      return;
    }

    if (result.status === 'created') {
      if (options.cleanupFlowMessages) {
        await this.cleanupTrackedFlowMessages(ctx, user.id);
      } else if (options.preferEdit) {
        const deleted = await deleteCurrentMessage(ctx);

        if (!deleted) {
          await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
        }
      }

      if (result.source === 'checkin' && result.checkinPayload) {
        const checkinPayload = result.checkinPayload;

        await replyHtml(
          ctx,
          formatCheckinConfirmation({
            moodScore: checkinPayload.moodScore,
            energyScore: checkinPayload.energyScore,
            stressScore: checkinPayload.stressScore,
            sleepHours: checkinPayload.sleepHours,
            sleepQuality: checkinPayload.sleepQuality,
            extraMetricScores: this.buildPayloadExtraMetricScores(checkinPayload),
            updated: checkinPayload.isUpdate ?? false,
            noteAdded: !!checkinPayload.noteText,
            tagsCount: this.getFinalizedTagIds(checkinPayload).length,
            eventAdded: true,
          }),
          telegramKeyboards.mainMenu(),
        );
        if (checkinPayload.showMenuAfterSave) {
          await this.replyNavigationMenu(ctx);
        }
        return;
      }

      await replyHtml(ctx, formatStandaloneEventSaved(result.createdEventsCount ?? 1), telegramKeyboards.mainMenu());
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

    if (result.status === 'invalid_end_date') {
      await ctx.reply(telegramCopy.validation.invalidEventEndDate);
      await this.replyEventPromptByState(ctx, user, FSM_STATES.event_end_date, result.source);
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
    options: MessageRenderOptions = {},
  ): Promise<void> {
    const promptOptions = this.withFlowPromptTracking(user.id, options);

    switch (state) {
      case FSM_STATES.checkin_mood:
        await this.sendHtml(ctx, getCheckinPrompt(FSM_STATES.checkin_mood, user), telegramKeyboards.scorePicker(), promptOptions);
        return;
      case FSM_STATES.checkin_energy:
        await this.sendHtml(
          ctx,
          getCheckinPrompt(FSM_STATES.checkin_energy, user),
          telegramKeyboards.scorePicker({ back: this.hasPreviousCoreCheckinStep(user, FSM_STATES.checkin_energy) }),
          promptOptions,
        );
        return;
      case FSM_STATES.checkin_stress:
        await this.sendHtml(
          ctx,
          getCheckinPrompt(FSM_STATES.checkin_stress, user),
          telegramKeyboards.scorePicker({ back: this.hasPreviousCoreCheckinStep(user, FSM_STATES.checkin_stress) }),
          promptOptions,
        );
        return;
      case FSM_STATES.checkin_sleep_hours:
        await this.sendHtml(
          ctx,
          getCheckinPrompt(FSM_STATES.checkin_sleep_hours, user),
          telegramKeyboards.sleepHoursActions({
            back: this.hasPreviousCoreCheckinStep(user, FSM_STATES.checkin_sleep_hours),
          }),
          promptOptions,
        );
        return;
      case FSM_STATES.checkin_sleep_quality:
        await this.sendHtml(
          ctx,
          getCheckinPrompt(FSM_STATES.checkin_sleep_quality, user),
          telegramKeyboards.sleepQualityActions({
            back: this.hasPreviousCoreCheckinStep(user, FSM_STATES.checkin_sleep_quality),
          }),
          promptOptions,
        );
        return;
      case FSM_STATES.checkin_metric_score: {
        const payload = await this.getSessionPayload(user.id);
        const activeMetricKey = payload.activeMetricKey as DailyMetricCatalogKey | undefined;
        const extraMetricKeys = payload.extraMetricKeys ?? [];

        if (!activeMetricKey || !extraMetricKeys.includes(activeMetricKey)) {
          await ctx.reply(telegramCopy.checkin.interrupted, telegramKeyboards.mainMenu());
          return;
        }

        const coreStepsCount = buildCoreCheckinStates(user).length;
        const metricIndex = extraMetricKeys.indexOf(activeMetricKey);
        const totalSteps = coreStepsCount + extraMetricKeys.length;
        const hasBack = coreStepsCount > 0 || metricIndex > 0;

        await this.sendHtml(
          ctx,
          getExtraMetricCheckinPrompt(getDailyMetricLabel(activeMetricKey), coreStepsCount + metricIndex + 1, totalSteps),
          telegramKeyboards.scorePicker({ back: hasBack }),
          promptOptions,
        );
        return;
      }
      case FSM_STATES.checkin_note_prompt:
        await this.sendHtml(ctx, telegramCopy.checkin.notePrompt, telegramKeyboards.checkinNotePrompt(), promptOptions);
        return;
      case FSM_STATES.checkin_note:
        await this.sendHtml(ctx, telegramCopy.checkin.noteInputPrompt, telegramKeyboards.eventTitleActions({ back: true }), promptOptions);
        return;
      case FSM_STATES.checkin_tags_prompt:
        await this.sendHtml(ctx, telegramCopy.checkin.tagsPrompt, telegramKeyboards.checkinTagsPrompt(), promptOptions);
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

        await this.sendHtml(
          ctx,
          formatCheckinTagsSelectionPrompt(effectiveSelected.length),
          telegramKeyboards.checkinTagsSelection(tags, effectiveSelected),
          promptOptions,
        );
        return;
      }
      case FSM_STATES.checkin_add_event_confirm:
        await this.sendHtml(ctx, telegramCopy.checkin.addEventPrompt, telegramKeyboards.checkinAddEventPrompt(), promptOptions);
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
    options: MessageRenderOptions = {},
  ): Promise<void> {
    const isFromCheckin = source === 'checkin';
    const promptOptions = this.withFlowPromptTracking(user.id, options);

    switch (state) {
      case FSM_STATES.event_type:
        await this.sendHtml(ctx, telegramCopy.event.typePrompt, telegramKeyboards.eventTypePicker({ back: isFromCheckin }), promptOptions);
        return;
      case FSM_STATES.event_title:
        await this.sendHtml(ctx, telegramCopy.event.titlePrompt, telegramKeyboards.eventTitleActions({ back: true }), promptOptions);
        return;
      case FSM_STATES.event_score:
        await this.sendHtml(ctx, telegramCopy.event.scorePrompt, telegramKeyboards.scorePicker({ back: true }), promptOptions);
        return;
      case FSM_STATES.event_description:
        await this.sendHtml(
          ctx,
          telegramCopy.event.descriptionPrompt,
          telegramKeyboards.eventDescriptionActions({ back: true }),
          promptOptions,
        );
        return;
      case FSM_STATES.event_end_date:
        await this.sendHtml(
          ctx,
          telegramCopy.event.endDatePrompt,
          telegramKeyboards.eventEndDateActions({ back: true }),
          promptOptions,
        );
        return;
      case FSM_STATES.event_repeat_mode:
      case FSM_STATES.event_repeat_count:
        await this.sendHtml(
          ctx,
          telegramCopy.event.endDatePrompt,
          telegramKeyboards.eventEndDateActions({ back: true }),
          promptOptions,
        );
        return;
      case FSM_STATES.checkin_add_event_confirm:
        await this.replyCheckinPromptByState(ctx, user, FSM_STATES.checkin_add_event_confirm, [], promptOptions);
        return;
      default:
        await ctx.reply(telegramCopy.common.actionNotAllowed, telegramKeyboards.mainMenu());
    }
  }

  private async replySettingsMenu(
    ctx: Context,
    user: User,
    options: MessageRenderOptions = {},
  ): Promise<void> {
    const trackedMetricsSummary = this.buildTrackedMetricsSummary(await this.usersService.getTrackedMetrics(user.id));

    await this.sendHtml(
      ctx,
      formatSettingsText({
        remindersEnabled: user.remindersEnabled,
        reminderTime: user.reminderTime,
        sleepMode: user.sleepMode,
        backgroundDeliveryAvailable: this.remindersService.isBackgroundDeliveryAvailable(),
        trackedMetricsSummary,
        trackMood: user.trackMood,
        trackEnergy: user.trackEnergy,
        trackStress: user.trackStress,
        trackSleep: user.trackSleep,
      }),
      telegramKeyboards.settingsMenu({
        remindersEnabled: user.remindersEnabled,
      }),
      options,
    );
  }

  private async replyStatsPeriodSelector(ctx: Context, options: MessageRenderOptions = {}): Promise<void> {
    await this.sendHtml(ctx, telegramCopy.stats.periodPrompt, telegramKeyboards.statsPeriodSelector(), options);
  }

  private async replyStatsMetricSelector(
    ctx: Context,
    user: User,
    periodType: SummaryPeriodType | null,
    options: MessageRenderOptions = {},
  ): Promise<void> {
    if (!periodType) {
      await this.fsmService.setState(user.id, FSM_STATES.stats_period_select, {});
      await this.replyStatsPeriodSelector(ctx, options);
      return;
    }

    const metricOptions = await this.getStatsMetricOptions(user.id);

    await this.sendHtml(
      ctx,
      formatStatsMetricPrompt(periodType),
      telegramKeyboards.statsMetricSelector(metricOptions),
      options,
    );
  }

  private async getStatsMetricOptions(userId: string): Promise<StatsMetricOption[]> {
    const enabledMetrics = await this.usersService.getEnabledCheckinMetrics(userId);
    return buildStatsMetricOptions(enabledMetrics);
  }

  private async replyDailyMetricsMenu(
    ctx: Context,
    userId: string,
    options: MessageRenderOptions = {},
  ): Promise<void> {
    const metrics = await this.usersService.getTrackedMetrics(userId);
    const metricOptions: SettingsMetricOptionData[] = metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      enabled: metric.enabled,
    }));

    await this.sendHtml(
      ctx,
      formatDailyMetricsSettingsText(metricOptions),
      telegramKeyboards.settingsDailyMetrics(metricOptions),
      options,
    );
  }

  private async replyHistoryPage(
    ctx: Context,
    userId: string,
    cursor?: string,
    mode: 'initial' | 'more' = 'initial',
    options: MessageRenderOptions = {},
  ): Promise<void> {
    const page = await this.checkinsService.getRecentEntriesPage(userId, HISTORY_PAGE_SIZE, cursor);

    if (page.staleCursor) {
      if (mode === 'more') {
        await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      }

      await replyHtml(ctx, telegramCopy.history.stale, telegramKeyboards.mainMenu());
      return;
    }

    if (page.entries.length === 0) {
      await this.sendHtml(
        ctx,
        telegramCopy.history.empty,
        options.preferEdit ? undefined : telegramKeyboards.mainMenu(),
        options,
      );
      return;
    }

    const text = formatHistoryEntries(page.entries, {
      title: mode === 'more' ? telegramCopy.history.moreTitle : telegramCopy.history.title,
    });
    const keyboard = telegramKeyboards.historyPage(
      page.entries.map((entry) => ({
        id: entry.id,
        entryDate: entry.entryDate,
      })),
      this.encodeHistoryPageCursor(cursor),
      page.nextCursor,
    );

    if (mode === 'more') {
      await editOrReplyHtml(ctx, text, keyboard);
      return;
    }

    await this.sendHtml(ctx, text, keyboard ?? telegramKeyboards.mainMenu(), options);
  }

  private async handleHistoryMoreCallback(ctx: Context, userId: string, cursor: string): Promise<void> {
    try {
      await this.replyHistoryPage(ctx, userId, cursor, 'more');
    } catch (error) {
      if (!this.isStaleHistoryEditError(error)) {
        throw error;
      }

      this.logger.warn(formatErrorLogEvent('history_callback_stale', error, {
        action: 'more',
        userId,
        cursor,
      }));
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await replyHtml(ctx, telegramCopy.history.stale, telegramKeyboards.mainMenu());
    }
  }

  private async replyHistoryDetail(
    ctx: Context,
    userId: string,
    entryId: string,
    pageCursorToken: string,
  ): Promise<void> {
    const detail = await this.checkinsService.getHistoryEntryDetail(userId, entryId);

    if (!detail) {
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await replyHtml(ctx, telegramCopy.history.stale, telegramKeyboards.mainMenu());
      return;
    }

    await editOrReplyHtml(
      ctx,
      formatHistoryEntryDetail(detail),
      telegramKeyboards.historyDetail(pageCursorToken),
    );
  }

  private async handleHistoryOpenCallback(
    ctx: Context,
    userId: string,
    entryId: string,
    pageCursorToken: string,
  ): Promise<void> {
    try {
      await this.replyHistoryDetail(ctx, userId, entryId, pageCursorToken);
    } catch (error) {
      if (!this.isStaleHistoryEditError(error)) {
        throw error;
      }

      this.logger.warn(formatErrorLogEvent('history_callback_stale', error, {
        action: 'open',
        userId,
        entryId,
        pageCursorToken,
      }));
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await replyHtml(ctx, telegramCopy.history.stale, telegramKeyboards.mainMenu());
    }
  }

  private async handleHistoryBackCallback(
    ctx: Context,
    userId: string,
    pageCursorToken: string,
  ): Promise<void> {
    try {
      const cursor = this.decodeHistoryPageCursor(pageCursorToken);
      await this.replyHistoryPage(ctx, userId, cursor, cursor ? 'more' : 'initial', { preferEdit: true });
    } catch (error) {
      if (!this.isStaleHistoryEditError(error)) {
        throw error;
      }

      this.logger.warn(formatErrorLogEvent('history_callback_stale', error, {
        action: 'back',
        userId,
        pageCursorToken,
      }));
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await ctx.reply(telegramCopy.history.stale, telegramKeyboards.mainMenu());
    }
  }

  private async ensureOnboardingCompleted(ctx: Context, user: User): Promise<boolean> {
    if (user.onboardingCompleted) {
      return true;
    }

    await ctx.reply(telegramCopy.onboarding.incompleteRedirect);
    await this.replyOnboardingProgress(ctx, user, false);
    return false;
  }

  private async ensureProductAccess(ctx: Context, user: User): Promise<boolean> {
    if (!user.consentGiven) {
      await this.replyPreConsentRedirect(ctx, user);
      return false;
    }

    return this.ensureOnboardingCompleted(ctx, user);
  }

  private async replyOnboardingProgress(ctx: Context, user: User, includeIntro: boolean): Promise<void> {
    const onboarding = await this.onboardingFlow.startOrResume(user, includeIntro);

    if (onboarding.step === 'already_ready') {
      await this.replyNavigationMenu(ctx, telegramCopy.startup.alreadyReady);
      return;
    }

    if (onboarding.step === 'invalid_reminder_time') {
      await ctx.reply(telegramCopy.validation.invalidTime, telegramKeyboards.onboardingReminderTime());
      return;
    }

    await this.replyOnboardingStep(ctx, onboarding.step, onboarding.includeIntro ?? false);
  }

  private async replyPreConsentRedirect(ctx: Context, user: User): Promise<void> {
    await ctx.reply(telegramCopy.terms.accessRequired, telegramKeyboards.cancelOnly());
    await this.replyOnboardingProgress(ctx, user, false);
  }

  private async getSelectedTagIdsFromSession(userId: string): Promise<string[]> {
    const session = await this.fsmService.getSession(userId);

    if (!session?.payloadJson || typeof session.payloadJson !== 'object') {
      return [];
    }

    const payload = session.payloadJson as CheckinDraftPayload;
    const selectedTagIds = Array.isArray(payload.selectedTagIds) ? payload.selectedTagIds : payload.confirmedTagIds;

    if (!Array.isArray(selectedTagIds)) {
      return [];
    }

    return selectedTagIds.filter((item): item is string => typeof item === 'string');
  }

  private getFinalizedTagIds(payload: CheckinDraftPayload): string[] {
    const tagIds = Array.isArray(payload.confirmedTagIds) ? payload.confirmedTagIds : payload.selectedTagIds;

    if (!Array.isArray(tagIds)) {
      return [];
    }

    return [...new Set(tagIds.filter((item): item is string => typeof item === 'string'))];
  }

  private isEventState(state: FsmState): boolean {
    return (
      state === FSM_STATES.event_type ||
      state === FSM_STATES.event_title ||
      state === FSM_STATES.event_score ||
      state === FSM_STATES.event_description ||
      state === FSM_STATES.event_end_date ||
      state === FSM_STATES.event_repeat_mode ||
      state === FSM_STATES.event_repeat_count
    );
  }

  private isCheckinState(state: FsmState): boolean {
    return (
      state === FSM_STATES.checkin_mood ||
      state === FSM_STATES.checkin_energy ||
      state === FSM_STATES.checkin_stress ||
      state === FSM_STATES.checkin_metric_score ||
      state === FSM_STATES.checkin_sleep_hours ||
      state === FSM_STATES.checkin_sleep_quality ||
      state === FSM_STATES.checkin_note_prompt ||
      state === FSM_STATES.checkin_note ||
      state === FSM_STATES.checkin_tags_prompt ||
      state === FSM_STATES.checkin_tags ||
      state === FSM_STATES.checkin_add_event_confirm
    );
  }

  private isOnboardingState(state: FsmState): boolean {
    return (
      state === FSM_STATES.onboarding_consent ||
      state === FSM_STATES.onboarding_reminder_time ||
      state === FSM_STATES.onboarding_first_checkin
    );
  }

  private isStatsState(state: FsmState): boolean {
    return state === FSM_STATES.stats_period_select || state === FSM_STATES.stats_metric_select;
  }

  private shouldEditCheckinCallbackScreen(state: FsmState): boolean {
    return this.isCheckinState(state);
  }

  private hasPreviousCoreCheckinStep(user: User, state: FsmState): boolean {
    if (!isCoreCheckinState(state)) {
      return false;
    }

    return getPreviousCoreCheckinState(user, state) !== null;
  }

  private parseDailyMetricCallback(callbackData: string): DailyMetricCatalogKey | null {
    if (callbackData.startsWith(TELEGRAM_CALLBACKS.settingsDailyMetricTogglePrefix)) {
      const metricKey = callbackData.slice(
        TELEGRAM_CALLBACKS.settingsDailyMetricTogglePrefix.length,
      ) as DailyMetricCatalogKey;

      if (metricKey.length > 0) {
        return metricKey;
      }
    }

    if (callbackData === TELEGRAM_CALLBACKS.settingsTrackMoodToggle) {
      return 'mood';
    }

    if (callbackData === TELEGRAM_CALLBACKS.settingsTrackEnergyToggle) {
      return 'energy';
    }

    if (callbackData === TELEGRAM_CALLBACKS.settingsTrackStressToggle) {
      return 'stress';
    }

    if (callbackData === TELEGRAM_CALLBACKS.settingsTrackSleepToggle) {
      return 'sleep';
    }

    return null;
  }

  private parseStatsMetricCallback(callbackData: string): StatsSelectedMetricKey | null {
    if (!callbackData.startsWith(TELEGRAM_CALLBACKS.statsMetricPrefix)) {
      return null;
    }

    const metricKey = callbackData.slice(TELEGRAM_CALLBACKS.statsMetricPrefix.length) as StatsSelectedMetricKey;
    return metricKey.length > 0 ? metricKey : null;
  }

  private async updateTrackedMetricSetting(
    ctx: Context,
    user: User,
    metricKey: DailyMetricCatalogKey,
  ): Promise<User | null> {
    try {
      const currentMetrics = await this.usersService.getTrackedMetrics(user.id);
      const currentMetric = currentMetrics.find((metric) => metric.key === metricKey);

      if (!currentMetric) {
        await ctx.reply(telegramCopy.settings.dailyMetricsStale);
        return user;
      }

      const updatedUser = await this.usersService.setTrackedMetric(user.id, metricKey, !currentMetric.enabled);

      await this.analyticsService.track('settings_updated', { field: metricKey, value: !currentMetric.enabled }, user.id);
      return updatedUser;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'INVALID_DAILY_TRACKING_CONFIGURATION') {
        throw error;
      }

      await ctx.reply(telegramCopy.validation.invalidDailyTrackingConfiguration);
      return null;
    }
  }

  private buildTrackedMetricsSummary(metrics: SettingsMetricOptionData[]): string {
    const enabledLabels = metrics.filter((metric) => metric.enabled).map((metric) => metric.label.toLowerCase());
    return enabledLabels.length > 0 ? enabledLabels.join(', ') : '—';
  }

  private buildConfirmationExtraMetricScores(
    metricValues?: Array<{ key: string; value: number }>,
  ): CheckinConfirmationData['extraMetricScores'] {
    return (metricValues ?? [])
      .filter((metric) => !this.isLegacyCoreMetric(metric.key))
      .map((metric) => ({
        key: metric.key as DailyMetricCatalogKey,
        label: getDailyMetricLabel(metric.key as DailyMetricCatalogKey),
        value: metric.value,
      }));
  }

  private buildPayloadExtraMetricScores(
    payload: CheckinDraftPayload,
  ): CheckinConfirmationData['extraMetricScores'] {
    return Object.entries(payload.metricScores ?? {})
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .map(([key, value]) => ({
        key: key as DailyMetricCatalogKey,
        label: getDailyMetricLabel(key as DailyMetricCatalogKey),
        value,
      }));
  }

  private isLegacyCoreMetric(key: string): key is 'mood' | 'energy' | 'stress' {
    return key === 'mood' || key === 'energy' || key === 'stress';
  }

  private parseSummaryPeriod(value: string): SummaryPeriodType | null {
    if (value === SummaryPeriodType.d7 || value === SummaryPeriodType.d30 || value === SummaryPeriodType.all) {
      return value;
    }

    return null;
  }

  private parseAdminOffset(value: string): number {
    const offset = Number(value);
    return Number.isInteger(offset) && offset >= 0 ? offset : 0;
  }

  private parseAdminUserStatsCallback(callbackData: string): AdminUserPeriodCallback | null {
    if (!callbackData.startsWith(TELEGRAM_CALLBACKS.adminUserStatsPrefix)) {
      return null;
    }

    const [userId, periodRaw] = callbackData
      .slice(TELEGRAM_CALLBACKS.adminUserStatsPrefix.length)
      .split(':');
    const periodType = this.parseSummaryPeriod(periodRaw ?? '');

    if (!userId || !periodType) {
      return null;
    }

    return { userId, periodType };
  }

  private parseAdminUserHistoryCallback(callbackData: string): AdminUserCursorCallback | null {
    if (!callbackData.startsWith(TELEGRAM_CALLBACKS.adminUserHistoryPrefix)) {
      return null;
    }

    const [userId, pageCursorToken] = callbackData
      .slice(TELEGRAM_CALLBACKS.adminUserHistoryPrefix.length)
      .split(':');

    if (!userId || !pageCursorToken) {
      return null;
    }

    return { userId, pageCursorToken };
  }

  private parseAdminEntryCallback(callbackData: string): AdminEntryCallback | null {
    if (!callbackData.startsWith(TELEGRAM_CALLBACKS.adminEntryOpenPrefix)) {
      return null;
    }

    const [entryId, pageCursorToken] = callbackData
      .slice(TELEGRAM_CALLBACKS.adminEntryOpenPrefix.length)
      .split(':');

    if (!entryId || !pageCursorToken) {
      return null;
    }

    return { entryId, pageCursorToken };
  }

  private parseAdminHistoryBackCallback(callbackData: string): AdminUserCursorCallback | null {
    if (!callbackData.startsWith(TELEGRAM_CALLBACKS.adminHistoryBackPrefix)) {
      return null;
    }

    const [userId, pageCursorToken] = callbackData
      .slice(TELEGRAM_CALLBACKS.adminHistoryBackPrefix.length)
      .split(':');

    if (!userId || !pageCursorToken) {
      return null;
    }

    return { userId, pageCursorToken };
  }

  private async getStatsPeriodFromSession(userId: string): Promise<SummaryPeriodType | null> {
    const payload = await this.getSessionPayload(userId);
    return this.parseSummaryPeriod(payload.statsPeriodType ?? '');
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

  private resolveStatsMetricChartColor(metricKey: StatsSelectedMetricKey): string {
    if (metricKey === 'mood') {
      return '#2563eb';
    }

    if (metricKey === 'energy') {
      return '#16a34a';
    }

    if (metricKey === 'stress') {
      return '#dc2626';
    }

    return '#0f766e';
  }

  private async runSafely(
    ctx: Context,
    handler: () => Promise<void>,
    routeKey: string,
  ): Promise<void> {
    try {
      await handler();
    } catch (error) {
      const err = toLogErrorDetails(error);
      const routeContext = await this.buildRouteLogContext(ctx, routeKey);
      this.logger.error(formatErrorLogEvent('telegram_route_failed', error, routeContext), err.stack);
      await this.recoverFromUnexpectedFlow(ctx);

      try {
        await ctx.reply(telegramCopy.common.unexpectedError, telegramKeyboards.mainMenu());
      } catch (replyError) {
        this.logger.warn(formatErrorLogEvent('telegram_fallback_reply_failed', replyError, routeContext));
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
      this.logger.warn(formatLogEvent('telegram_fsm_reset_after_error', {
        userId: user.id,
        previousState: state,
      }));
    }
  }

  private async getOrCreateUserFromContext(ctx: Context): Promise<User | null> {
    const profile = extractTelegramProfile(ctx);

    if (!profile) {
      this.logger.warn(formatLogEvent('telegram_missing_user_profile'));
      return null;
    }

    return this.usersService.getOrCreateTelegramUser(profile);
  }

  private async buildRouteLogContext(ctx: Context, routeKey: string): Promise<Record<string, unknown>> {
    const callbackData = getCallbackData(ctx);
    const profile = extractTelegramProfile(ctx);
    const context: Record<string, unknown> = {
      routeKey,
      updateType: callbackData ? 'callback_query' : 'message',
      callbackKey: this.resolveCallbackLogKey(callbackData),
      telegramUserId: profile?.telegramId.toString(),
    };

    if (!profile) {
      return context;
    }

    try {
      const user = await this.usersService.findByTelegramId(profile.telegramId);

      if (!user) {
        return context;
      }

      context.userId = user.id;
      context.fsmState = await this.fsmService.getState(user.id);
    } catch (error) {
      this.logger.warn(formatErrorLogEvent('telegram_route_context_failed', error, { routeKey }));
    }

    return context;
  }

  private isAllowedPreConsentCallback(callbackData: string): boolean {
    return (
      callbackData === TELEGRAM_CALLBACKS.consentAccept ||
      callbackData === TELEGRAM_CALLBACKS.actionCancel ||
      callbackData === TELEGRAM_CALLBACKS.menuTerms ||
      callbackData === TELEGRAM_CALLBACKS.menuHelp
    );
  }

  private resolveCallbackLogKey(callbackData: string | null): string | undefined {
    if (!callbackData) {
      return undefined;
    }

    const prefixMatch = Object.entries(TELEGRAM_CALLBACKS).find(([key, value]) => (
      key.endsWith('Prefix') && callbackData.startsWith(value)
    ));

    if (prefixMatch) {
      return prefixMatch[0];
    }

    const exactMatch = Object.entries(TELEGRAM_CALLBACKS).find(([, value]) => value === callbackData);
    return exactMatch?.[0] ?? 'unknown';
  }

  private isStaleHistoryEditError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);

    return message.includes('message is not modified') || message.includes('message to edit not found');
  }

  private encodeHistoryPageCursor(cursor?: string): string {
    return cursor ?? HISTORY_ROOT_CURSOR_TOKEN;
  }

  private decodeHistoryPageCursor(token: string): string | undefined {
    return token === HISTORY_ROOT_CURSOR_TOKEN ? undefined : token;
  }

  private parseHistoryOpenCallback(
    callbackData: string,
  ): { entryId: string; pageCursorToken: string } | null {
    if (!callbackData.startsWith(TELEGRAM_CALLBACKS.historyOpenPrefix)) {
      return null;
    }

    const raw = callbackData.slice(TELEGRAM_CALLBACKS.historyOpenPrefix.length);
    const separatorIndex = raw.lastIndexOf(':');

    if (separatorIndex <= 0 || separatorIndex === raw.length - 1) {
      return null;
    }

    const entryId = raw.slice(0, separatorIndex);
    const pageCursorToken = raw.slice(separatorIndex + 1);

    if (!entryId || !pageCursorToken) {
      return null;
    }

    return {
      entryId,
      pageCursorToken,
    };
  }

  private parseHistoryBackCallback(callbackData: string): { pageCursorToken: string } | null {
    if (!callbackData.startsWith(TELEGRAM_CALLBACKS.historyBackPrefix)) {
      return null;
    }

    const pageCursorToken = callbackData.slice(TELEGRAM_CALLBACKS.historyBackPrefix.length);

    if (!pageCursorToken) {
      return null;
    }

    return {
      pageCursorToken,
    };
  }
}
