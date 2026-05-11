import { Body, Controller, Headers, HttpCode, Inject, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, type Context } from 'telegraf';
import type { Update } from 'telegraf/types';

import { formatErrorLogEvent, formatLogEvent } from '../common/utils/logging.utils';
import type { TelegramMode } from '../config/telegram.config';
import { TELEGRAM_BOT } from './telegram.tokens';

interface TelegramWebhookResponse {
  ok: true;
  skipped?: boolean;
}

@Controller('telegram')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: Telegraf<Context>,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Body() update: Update,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string | string[],
  ): Promise<TelegramWebhookResponse> {
    const mode =
      (this.configService.get<string>('telegram.mode', { infer: true }) as TelegramMode | undefined) ??
      'polling';

    if (mode !== 'webhook') {
      this.logger.warn(formatLogEvent('telegram_webhook_update_skipped', {
        reason: 'mode_not_webhook',
        mode,
      }));
      return {
        ok: true,
        skipped: true,
      };
    }

    this.assertValidSecret(secretToken);

    try {
      await this.bot.handleUpdate(update);
      return { ok: true };
    } catch (error) {
      this.logger.error(formatErrorLogEvent('telegram_webhook_update_failed', error));
      throw error;
    }
  }

  private assertValidSecret(secretToken?: string | string[]): void {
    const expectedSecret = this.configService.get<string>('telegram.webhookSecret', { infer: true });

    if (!expectedSecret) {
      return;
    }

    const actualSecret = Array.isArray(secretToken) ? secretToken[0] : secretToken;

    if (actualSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid Telegram webhook secret.');
    }
  }
}
