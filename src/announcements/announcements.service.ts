import { randomBytes } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AnnouncementDeliveryStatus,
  AnnouncementStatus,
  AnnouncementType,
  Prisma,
  type AnnouncementCampaign,
  type AnnouncementDelivery,
  type AnnouncementPollOption,
  type User,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { Markup, Telegram } from 'telegraf';

import { APP_QUEUES, TEXT_LIMITS, TELEGRAM_CALLBACKS } from '../common/constants/app.constants';
import { formatErrorLogEvent } from '../common/utils/logging.utils';
import type { TelegramConfig } from '../config/telegram.config';
import { formatAnnouncementUserMessage } from '../telegram/telegram.copy';
import {
  AnnouncementsRepository,
  type AnnouncementCampaignDetail,
  type AnnouncementCampaignPage,
  type AnnouncementCampaignWithOptions,
} from './announcements.repository';
import {
  type AnnouncementPollVoteResult,
  type AnnouncementDeliveryCounts,
  type AnnouncementDeliveryJobData,
  type AnnouncementFinalizeJobData,
  type AnnouncementSendReport,
  type AnnouncementTypeKey,
  ANNOUNCEMENT_JOB_NAMES,
} from './announcements.types';

const TELEGRAM_PHOTO_CAPTION_LIMIT = 1024;
const MAX_POLL_OPTIONS = 6;
const MIN_POLL_OPTIONS = 2;
const SENDING_RECOVERY_AFTER_MS = 10 * 60 * 1000;
const DELIVERY_BATCH_SIZE = 25;
const DELIVERY_BATCH_PAUSE_MS = 1000;
const AUDIENCE_PAGE_SIZE = 1000;
const DELIVERY_JOB_PAGE_SIZE = 500;
const DELIVERY_JOB_ATTEMPTS = 4;
const DELIVERY_JOB_BACKOFF_MS = 5000;
const FINALIZE_JOB_DELAY_MS = 5000;

interface TelegramSendResult {
  message_id?: number;
}

interface DeliveryFailure {
  status: 'failed' | 'blocked';
  code?: string;
  message?: string;
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);
  private readonly telegramApi: Telegram;
  private readonly telegramEnabled: boolean;
  private readonly jobsEnabled: boolean;

  constructor(
    private readonly announcementsRepository: AnnouncementsRepository,
    configService: ConfigService,
    @Optional() @InjectQueue(APP_QUEUES.announcements) private readonly announcementsQueue?: Queue,
  ) {
    const telegramConfig = configService.get<TelegramConfig>('telegram', { infer: true });
    const botToken = telegramConfig?.botToken ?? '';

    this.telegramApi = new Telegram(botToken);
    this.telegramEnabled = !!botToken && !botToken.startsWith('replace_with_');
    this.jobsEnabled = configService.get<boolean>('app.jobsEnabled', { infer: true }) ?? false;
  }

  validateTitle(rawTitle: string): string | null {
    const title = rawTitle.trim();
    return title.length > 0 && title.length <= TEXT_LIMITS.announcementTitle ? title : null;
  }

  validateBody(rawBody: string): string | null {
    const body = rawBody.trim();
    return body.length > 0 && body.length <= TEXT_LIMITS.announcementBody ? body : null;
  }

  parsePollOptions(rawOptions: string): string[] | null {
    const options = rawOptions
      .split(/\r?\n/)
      .map((line) => this.normalizePollOptionLine(line))
      .filter((line) => line.length > 0);
    const normalized = new Set<string>();

    if (options.length < MIN_POLL_OPTIONS || options.length > MAX_POLL_OPTIONS) {
      return null;
    }

    for (const option of options) {
      if (option.length > TEXT_LIMITS.announcementPollOption) {
        return null;
      }

      const normalizedOption = option.toLocaleLowerCase('ru-RU');

      if (normalized.has(normalizedOption)) {
        return null;
      }

      normalized.add(normalizedOption);
    }

    return options;
  }

  async createDraft(
    type: AnnouncementTypeKey,
    adminTelegramId: bigint,
  ): Promise<AnnouncementCampaign> {
    return this.announcementsRepository.createCampaign({
      type,
      createdByAdminTelegramId: adminTelegramId,
      pollToken: type === AnnouncementType.poll ? this.generatePollToken() : null,
    });
  }

  async setTitle(campaignId: string, rawTitle: string): Promise<AnnouncementCampaign | null> {
    const title = this.validateTitle(rawTitle);

    if (!title) {
      return null;
    }

    return this.announcementsRepository.updateCampaign(campaignId, {
      title,
      status: AnnouncementStatus.draft,
    });
  }

  async setBody(campaignId: string, rawBody: string): Promise<AnnouncementCampaign | null> {
    const body = this.validateBody(rawBody);

    if (!body) {
      return null;
    }

    return this.announcementsRepository.updateCampaign(campaignId, {
      body,
      status: AnnouncementStatus.draft,
    });
  }

  async setImage(
    campaignId: string,
    fileId: string,
    fileUniqueId?: string,
  ): Promise<AnnouncementCampaign> {
    return this.announcementsRepository.updateCampaign(campaignId, {
      imageTelegramFileId: fileId,
      imageTelegramFileUniqueId: fileUniqueId ?? null,
      imageAddedAt: new Date(),
      status: AnnouncementStatus.draft,
    });
  }

  async clearImage(campaignId: string): Promise<AnnouncementCampaign> {
    return this.announcementsRepository.updateCampaign(campaignId, {
      imageTelegramFileId: null,
      imageTelegramFileUniqueId: null,
      imageAddedAt: null,
      status: AnnouncementStatus.draft,
    });
  }

  async setPollOptions(
    campaignId: string,
    rawOptions: string,
  ): Promise<AnnouncementPollOption[] | null> {
    const options = this.parsePollOptions(rawOptions);

    if (!options) {
      return null;
    }

    await this.announcementsRepository.updateCampaign(campaignId, {
      status: AnnouncementStatus.draft,
    });
    return this.announcementsRepository.replacePollOptions(campaignId, options);
  }

  getCampaignDetail(campaignId: string): Promise<AnnouncementCampaignDetail | null> {
    return this.announcementsRepository.findCampaignDetail(campaignId);
  }

  listCampaigns(options: { offset: number; limit: number }): Promise<AnnouncementCampaignPage> {
    return this.announcementsRepository.listCampaigns(options);
  }

  countAudience(): Promise<number> {
    return this.announcementsRepository.countConsentedAudience();
  }

  async preparePreview(campaignId: string): Promise<{
    campaign: AnnouncementCampaignWithOptions;
    audienceCount: number;
  } | null> {
    const campaign = await this.announcementsRepository.findCampaignWithOptions(campaignId);

    if (!campaign || !this.isCampaignReady(campaign)) {
      return null;
    }

    await this.announcementsRepository.markCampaignReady(campaignId);
    return {
      campaign,
      audienceCount: await this.announcementsRepository.countConsentedAudience(),
    };
  }

  async cancelCampaign(campaignId: string): Promise<void> {
    const campaign = await this.announcementsRepository.findCampaignWithOptions(campaignId);

    if (!campaign || campaign.status === AnnouncementStatus.sending || campaign.status === AnnouncementStatus.sent) {
      return;
    }

    await this.announcementsRepository.cancelCampaign(campaignId);
  }

  async sendCampaign(campaignId: string): Promise<AnnouncementSendReport | null> {
    if (this.isBackgroundDeliveryAvailable()) {
      return this.enqueueCampaign(campaignId);
    }

    return this.sendCampaignSynchronously(campaignId);
  }

  async processDeliveryJob(
    deliveryId: string,
    options: { finalAttempt: boolean },
  ): Promise<void> {
    const delivery = await this.announcementsRepository.findDeliveryWithCampaign(deliveryId);

    if (!delivery || delivery.status !== AnnouncementDeliveryStatus.pending) {
      return;
    }

    if (delivery.campaign.status !== AnnouncementStatus.sending || !this.isCampaignReady(delivery.campaign)) {
      return;
    }

    await this.sendDelivery(delivery.campaign, delivery, {
      retryable: true,
      finalAttempt: options.finalAttempt,
    });
  }

  async processFinalizeCampaignJob(campaignId: string): Promise<void> {
    const report = await this.finalizeCampaignIfComplete(campaignId);

    if (report && report.deliveryCounts.pending > 0) {
      await this.enqueueFinalizeJob(campaignId, FINALIZE_JOB_DELAY_MS);
    }
  }

  private async sendCampaignSynchronously(campaignId: string): Promise<AnnouncementSendReport | null> {
    const campaign = await this.announcementsRepository.findCampaignWithOptions(campaignId);

    if (!campaign || !this.isCampaignReady(campaign) || !this.canSendCampaign(campaign)) {
      return null;
    }

    const claimed = await this.claimCampaignForSend(campaign);

    if (!claimed) {
      return null;
    }

    const sendingCampaign = await this.announcementsRepository.findCampaignWithOptions(campaignId);

    if (!sendingCampaign || !this.isCampaignReady(sendingCampaign)) {
      return null;
    }

    const audience = await this.announcementsRepository.findConsentedAudienceUsers();
    await this.announcementsRepository.createAudienceDeliveries(campaignId, audience);

    const deliveries = await this.announcementsRepository.findPendingDeliveries(campaignId);

    await this.sendPendingDeliveries(sendingCampaign, deliveries);

    const deliveryCounts = await this.announcementsRepository.getDeliveryCounts(campaignId);
    const finalStatus = this.resolveFinalStatus(deliveryCounts);

    await this.announcementsRepository.markCampaignFinished(campaignId, finalStatus);

    return {
      campaignId,
      audienceCount: this.sumDeliveryCounts(deliveryCounts),
      deliveryCounts,
      queued: false,
    };
  }

  private async enqueueCampaign(campaignId: string): Promise<AnnouncementSendReport | null> {
    const campaign = await this.announcementsRepository.findCampaignWithOptions(campaignId);

    if (!campaign || !this.isCampaignReady(campaign) || !this.canSendCampaign(campaign)) {
      return null;
    }

    const claimed = await this.claimCampaignForSend(campaign);

    if (!claimed) {
      return null;
    }

    const sendingCampaign = await this.announcementsRepository.findCampaignWithOptions(campaignId);

    if (!sendingCampaign || !this.isCampaignReady(sendingCampaign)) {
      return null;
    }

    await this.createAudienceDeliveriesForCampaign(campaignId);
    const queuedDeliveriesCount = await this.enqueuePendingDeliveryJobs(campaignId);

    if (queuedDeliveriesCount > 0) {
      await this.enqueueFinalizeJob(campaignId, FINALIZE_JOB_DELAY_MS);
    } else {
      await this.finalizeCampaignIfComplete(campaignId);
    }

    const deliveryCounts = await this.announcementsRepository.getDeliveryCounts(campaignId);

    return {
      campaignId,
      audienceCount: this.sumDeliveryCounts(deliveryCounts),
      deliveryCounts,
      queued: queuedDeliveriesCount > 0,
    };
  }

  async recordPollVote(
    user: User,
    token: string,
    sortOrder: number,
  ): Promise<AnnouncementPollVoteResult> {
    if (!user.consentGiven) {
      return { status: 'not_allowed' };
    }

    const campaign = await this.announcementsRepository.findCampaignByPollToken(token);

    if (!campaign || campaign.type !== AnnouncementType.poll || !this.isPollVotingOpen(campaign)) {
      return { status: 'not_found' };
    }

    const option = campaign.pollOptions.find((item) => item.sortOrder === sortOrder);

    if (!option) {
      return { status: 'not_found' };
    }

    const existingVote = await this.announcementsRepository.findExistingVote(campaign.id, user.id);

    if (existingVote) {
      return { status: 'already_voted', optionLabel: option.label };
    }

    try {
      await this.announcementsRepository.createPollVote({
        campaignId: campaign.id,
        optionId: option.id,
        userId: user.id,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return { status: 'already_voted', optionLabel: option.label };
      }

      throw error;
    }

    return { status: 'voted', optionLabel: option.label };
  }

  async getPollVoteCounts(campaignId: string): Promise<Map<string, number>> {
    return this.announcementsRepository.getPollVoteCounts(campaignId);
  }

  getDeliveryCounts(campaignId: string): Promise<AnnouncementDeliveryCounts> {
    return this.announcementsRepository.getDeliveryCounts(campaignId);
  }

  buildUserMessageHtml(campaign: AnnouncementCampaignWithOptions): string {
    return formatAnnouncementUserMessage(campaign);
  }

  buildPollKeyboard(campaign: AnnouncementCampaignWithOptions): ReturnType<typeof Markup.inlineKeyboard> | undefined {
    if (campaign.type !== AnnouncementType.poll || !campaign.pollToken || campaign.pollOptions.length === 0) {
      return undefined;
    }

    return Markup.inlineKeyboard(
      campaign.pollOptions.map((option) => [
        Markup.button.callback(
          option.label,
          `${TELEGRAM_CALLBACKS.announcementVotePrefix}${campaign.pollToken}:${option.sortOrder}`,
        ),
      ]),
    );
  }

  private isBackgroundDeliveryAvailable(): boolean {
    return this.jobsEnabled && !!this.announcementsQueue;
  }

  private async createAudienceDeliveriesForCampaign(campaignId: string): Promise<void> {
    let afterId: string | undefined;

    while (true) {
      const users = await this.announcementsRepository.findConsentedAudienceUsersPage({
        afterId,
        limit: AUDIENCE_PAGE_SIZE,
      });

      if (users.length === 0) {
        return;
      }

      await this.announcementsRepository.createAudienceDeliveries(campaignId, users);
      afterId = users[users.length - 1].id;

      if (users.length < AUDIENCE_PAGE_SIZE) {
        return;
      }
    }
  }

  private async enqueuePendingDeliveryJobs(campaignId: string): Promise<number> {
    let afterId: string | undefined;
    let queuedCount = 0;

    while (true) {
      const deliveries = await this.announcementsRepository.findPendingDeliveriesPage(campaignId, {
        afterId,
        limit: DELIVERY_JOB_PAGE_SIZE,
      });

      if (deliveries.length === 0) {
        return queuedCount;
      }

      await this.enqueueDeliveryJobs(deliveries);
      queuedCount += deliveries.length;
      afterId = deliveries[deliveries.length - 1].id;

      if (deliveries.length < DELIVERY_JOB_PAGE_SIZE) {
        return queuedCount;
      }
    }
  }

  private async enqueueDeliveryJobs(deliveries: AnnouncementDelivery[]): Promise<void> {
    if (!this.announcementsQueue || deliveries.length === 0) {
      return;
    }

    await this.announcementsQueue.addBulk(
      deliveries.map((delivery) => ({
        name: ANNOUNCEMENT_JOB_NAMES.sendDelivery,
        data: { deliveryId: delivery.id } satisfies AnnouncementDeliveryJobData,
        opts: {
          jobId: `announcement:delivery:${delivery.id}`,
          attempts: DELIVERY_JOB_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: DELIVERY_JOB_BACKOFF_MS,
          },
          removeOnComplete: true,
          removeOnFail: true,
        },
      })),
    );
  }

  private async enqueueFinalizeJob(campaignId: string, delay: number): Promise<void> {
    if (!this.announcementsQueue) {
      return;
    }

    await this.announcementsQueue.add(
      ANNOUNCEMENT_JOB_NAMES.finalizeCampaign,
      { campaignId } satisfies AnnouncementFinalizeJobData,
      {
        delay,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: DELIVERY_JOB_BACKOFF_MS,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  private async finalizeCampaignIfComplete(campaignId: string): Promise<AnnouncementSendReport | null> {
    const campaign = await this.announcementsRepository.findCampaignWithOptions(campaignId);

    if (!campaign || campaign.status !== AnnouncementStatus.sending) {
      return null;
    }

    const deliveryCounts = await this.announcementsRepository.getDeliveryCounts(campaignId);

    if (deliveryCounts.pending > 0) {
      return {
        campaignId,
        audienceCount: this.sumDeliveryCounts(deliveryCounts),
        deliveryCounts,
        queued: true,
      };
    }

    const finalStatus = this.resolveFinalStatus(deliveryCounts);
    await this.announcementsRepository.markCampaignFinished(campaignId, finalStatus);

    return {
      campaignId,
      audienceCount: this.sumDeliveryCounts(deliveryCounts),
      deliveryCounts,
      queued: false,
    };
  }

  private normalizePollOptionLine(line: string): string {
    return line
      .trim()
      .replace(/^[-*\u2022]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .trim();
  }

  private async claimCampaignForSend(campaign: AnnouncementCampaignWithOptions): Promise<boolean> {
    if (campaign.status === AnnouncementStatus.draft || campaign.status === AnnouncementStatus.ready) {
      return this.announcementsRepository.claimCampaignForSending(campaign.id);
    }

    if (this.isStaleSendingCampaign(campaign)) {
      const staleBefore = new Date(Date.now() - SENDING_RECOVERY_AFTER_MS);
      return this.announcementsRepository.claimStaleSendingCampaign(campaign.id, staleBefore);
    }

    return false;
  }

  private async sendPendingDeliveries(
    campaign: AnnouncementCampaignWithOptions,
    deliveries: AnnouncementDelivery[],
  ): Promise<void> {
    for (let index = 0; index < deliveries.length; index += 1) {
      await this.sendDelivery(campaign, deliveries[index]);

      if ((index + 1) % DELIVERY_BATCH_SIZE === 0 && index < deliveries.length - 1) {
        await this.sleep(DELIVERY_BATCH_PAUSE_MS);
      }
    }
  }

  private resolveFinalStatus(
    deliveryCounts: AnnouncementDeliveryCounts,
  ): Extract<AnnouncementStatus, 'sent' | 'partially_failed' | 'failed'> {
    const failedCount = deliveryCounts.failed + deliveryCounts.blocked + deliveryCounts.pending;

    if (failedCount === 0) {
      return AnnouncementStatus.sent;
    }

    return deliveryCounts.sent > 0 ? AnnouncementStatus.partially_failed : AnnouncementStatus.failed;
  }

  private sumDeliveryCounts(deliveryCounts: AnnouncementDeliveryCounts): number {
    return deliveryCounts.pending + deliveryCounts.sent + deliveryCounts.failed + deliveryCounts.blocked;
  }

  private isPollVotingOpen(campaign: AnnouncementCampaignWithOptions): boolean {
    return (
      campaign.status === AnnouncementStatus.sending ||
      campaign.status === AnnouncementStatus.sent ||
      campaign.status === AnnouncementStatus.partially_failed
    );
  }

  private async sendDelivery(
    campaign: AnnouncementCampaignWithOptions,
    delivery: AnnouncementDelivery,
    options: { retryable?: boolean; finalAttempt?: boolean } = {},
  ): Promise<void> {
    if (!this.telegramEnabled) {
      await this.announcementsRepository.updateDeliveryFailed(delivery.id, AnnouncementDeliveryStatus.failed, {
        code: 'telegram_disabled',
        message: 'Telegram bot token is not configured for sending.',
      });
      return;
    }

    try {
      const messageIds = await this.sendCampaignMessage(String(delivery.telegramId), campaign);
      await this.announcementsRepository.updateDeliverySent(delivery.id, messageIds);
    } catch (error) {
      const failure = this.toDeliveryFailure(error);

      if (options.retryable && failure.status === AnnouncementDeliveryStatus.failed && !options.finalAttempt) {
        await this.announcementsRepository.markDeliveryAttemptFailed(delivery.id, {
          code: failure.code,
          message: failure.message,
        });
        throw error;
      }

      await this.announcementsRepository.updateDeliveryFailed(delivery.id, failure.status, {
        code: failure.code,
        message: failure.message,
      });
      this.logger.warn(formatErrorLogEvent('announcement_delivery_failed', error, {
        campaignId: campaign.id,
        deliveryId: delivery.id,
        telegramId: delivery.telegramId.toString(),
      }));
    }
  }

  private async sendCampaignMessage(
    telegramId: string,
    campaign: AnnouncementCampaignWithOptions,
  ): Promise<number[]> {
    const message = this.buildUserMessageHtml(campaign);
    const keyboard = this.buildPollKeyboard(campaign);
    const messageIds: number[] = [];

    if (campaign.imageTelegramFileId && message.length <= TELEGRAM_PHOTO_CAPTION_LIMIT) {
      const sent = await this.telegramApi.sendPhoto(telegramId, campaign.imageTelegramFileId, {
        caption: message,
        parse_mode: 'HTML',
        ...(keyboard ?? {}),
      });
      this.pushMessageId(messageIds, sent as TelegramSendResult);
      return messageIds;
    }

    if (campaign.imageTelegramFileId) {
      const photo = await this.telegramApi.sendPhoto(telegramId, campaign.imageTelegramFileId);
      this.pushMessageId(messageIds, photo as TelegramSendResult);
    }

    const text = await this.telegramApi.sendMessage(telegramId, message, {
      parse_mode: 'HTML',
      ...(keyboard ?? {}),
    });
    this.pushMessageId(messageIds, text as TelegramSendResult);
    return messageIds;
  }

  private pushMessageId(messageIds: number[], message: TelegramSendResult): void {
    if (typeof message.message_id === 'number') {
      messageIds.push(message.message_id);
    }
  }

  private isCampaignReady(campaign: AnnouncementCampaignWithOptions): boolean {
    if (!this.validateTitle(campaign.title) || !this.validateBody(campaign.body)) {
      return false;
    }

    if (campaign.type === AnnouncementType.poll) {
      return campaign.pollOptions.length >= MIN_POLL_OPTIONS && campaign.pollOptions.length <= MAX_POLL_OPTIONS;
    }

    return true;
  }

  private canSendCampaign(campaign: AnnouncementCampaignWithOptions): boolean {
    return (
      campaign.status === AnnouncementStatus.draft ||
      campaign.status === AnnouncementStatus.ready ||
      this.isStaleSendingCampaign(campaign)
    );
  }

  private isStaleSendingCampaign(campaign: AnnouncementCampaignWithOptions): boolean {
    if (campaign.status !== AnnouncementStatus.sending) {
      return false;
    }

    if (!campaign.startedAt) {
      return true;
    }

    return campaign.startedAt.getTime() <= Date.now() - SENDING_RECOVERY_AFTER_MS;
  }

  private toDeliveryFailure(error: unknown): DeliveryFailure {
    const response = this.extractTelegramErrorResponse(error);
    const code = response?.error_code ? String(response.error_code) : undefined;
    const description = response?.description ?? (error instanceof Error ? error.message : String(error));
    const isBlocked = response?.error_code === 403 || /blocked|forbidden/i.test(description);

    return {
      status: isBlocked ? AnnouncementDeliveryStatus.blocked : AnnouncementDeliveryStatus.failed,
      code,
      message: this.truncateErrorMessage(description),
    };
  }

  private extractTelegramErrorResponse(error: unknown): { error_code?: number; description?: string } | null {
    if (!error || typeof error !== 'object' || !('response' in error)) {
      return null;
    }

    const response = (error as { response?: unknown }).response;

    if (!response || typeof response !== 'object') {
      return null;
    }

    return response as { error_code?: number; description?: string };
  }

  private truncateErrorMessage(message: string): string {
    const limit = 500;
    return message.length <= limit ? message : `${message.slice(0, limit - 1).trimEnd()}…`;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private generatePollToken(): string {
    return randomBytes(6).toString('base64url');
  }
}
