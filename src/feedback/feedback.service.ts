import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FeedbackItem, User } from '@prisma/client';
import { Telegram } from 'telegraf';

import { AnalyticsService } from '../analytics/analytics.service';
import { TEXT_LIMITS } from '../common/constants/app.constants';
import { formatErrorLogEvent } from '../common/utils/logging.utils';
import type { AdminConfig } from '../config/admin.config';
import type { TelegramConfig } from '../config/telegram.config';
import { FeedbackRepository } from './feedback.repository';
import {
  FEEDBACK_TYPE_BY_KEY,
  type FeedbackTypeKey,
  toPrismaFeedbackType,
} from './feedback.types';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  private readonly adminTelegramIds: bigint[];
  private readonly telegramApi: Telegram;
  private readonly telegramEnabled: boolean;

  constructor(
    private readonly feedbackRepository: FeedbackRepository,
    private readonly analyticsService: AnalyticsService,
    configService: ConfigService,
  ) {
    const adminConfig = configService.get<AdminConfig>('admin', { infer: true });
    const telegramConfig = configService.get<TelegramConfig>('telegram', { infer: true });
    const botToken = telegramConfig?.botToken ?? '';

    this.adminTelegramIds = adminConfig?.telegramIds ?? [];
    this.telegramApi = new Telegram(botToken);
    this.telegramEnabled = !!botToken && !botToken.startsWith('replace_with_');
  }

  validateMessage(rawMessage: string): string | null {
    const message = rawMessage.trim();
    return message.length > 0 && message.length <= TEXT_LIMITS.feedbackMessage ? message : null;
  }

  async submit(user: User, type: FeedbackTypeKey, rawMessage: string): Promise<FeedbackItem | null> {
    const message = this.validateMessage(rawMessage);

    if (!message) {
      return null;
    }

    const item = await this.feedbackRepository.create({
      userId: user.id,
      feedbackType: toPrismaFeedbackType(type),
      message,
    });

    await this.analyticsService.track('feedback_submitted', { type, feedbackId: item.id }, user.id);
    await this.notifyAdmins(user, item);
    return item;
  }

  private async notifyAdmins(user: User, item: FeedbackItem): Promise<void> {
    if (!this.telegramEnabled || this.adminTelegramIds.length === 0) {
      return;
    }

    const typeLabel = FEEDBACK_TYPE_BY_KEY.get(item.feedbackType as FeedbackTypeKey)?.label ?? item.feedbackType;
    const username = user.username ? `@${user.username}` : 'без username';
    const userName = user.firstName ? `${user.firstName} (${username})` : username;
    const message = [
      'Новая обратная связь в emoTrack',
      '',
      `Тип: ${typeLabel}`,
      `Пользователь: ${userName}`,
      `Telegram ID: ${user.telegramId.toString()}`,
      `Feedback ID: ${item.id}`,
      '',
      this.truncateForNotification(item.message),
    ].join('\n');

    await Promise.all(
      this.adminTelegramIds.map(async (telegramId) => {
        try {
          await this.telegramApi.sendMessage(String(telegramId), message);
        } catch (error) {
          this.logger.warn(formatErrorLogEvent('feedback_admin_notification_failed', error, {
            feedbackId: item.id,
            adminTelegramId: telegramId.toString(),
          }));
        }
      }),
    );
  }

  private truncateForNotification(message: string): string {
    const limit = 700;

    if (message.length <= limit) {
      return message;
    }

    return `${message.slice(0, limit - 1).trimEnd()}...`;
  }
}
