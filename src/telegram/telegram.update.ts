import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, type Context } from 'telegraf';

import { formatErrorLogEvent, formatLogEvent, toLogErrorDetails } from '../common/utils/logging.utils';
import type { TelegramMode } from '../config/telegram.config';
import { TELEGRAM_COMMANDS } from './telegram.copy';
import { TelegramRouter } from './telegram.router';

const TELEGRAM_BOT_TOKEN = 'TELEGRAM_BOT';

@Injectable()
export class TelegramUpdate implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramUpdate.name);
  private isLaunched = false;
  private mode: TelegramMode = 'polling';

  constructor(
    @Inject(TELEGRAM_BOT_TOKEN) private readonly bot: Telegraf<Context>,
    private readonly telegramRouter: TelegramRouter,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.telegramRouter.register(this.bot);

    const token = this.configService.get<string>('telegram.botToken');
    this.mode =
      (this.configService.get<string>('telegram.mode', { infer: true }) as TelegramMode | undefined) ??
      'polling';
    const nodeEnv = this.configService.get<string>('app.nodeEnv');

    if (!token || token.startsWith('replace_with_') || nodeEnv === 'test') {
      this.logger.warn(formatLogEvent('telegram_launch_skipped', {
        reason: !token || token.startsWith('replace_with_') ? 'token_placeholder' : 'test_environment',
        mode: this.mode,
        nodeEnv,
      }));
      return;
    }

    try {
      await this.syncCommands();

      if (this.mode === 'webhook') {
        const webhookUrl = this.configService.get<string>('telegram.webhookUrl', { infer: true });
        const webhookSecret = this.configService.get<string>('telegram.webhookSecret', { infer: true });

        if (!webhookUrl) {
          this.logger.warn(formatLogEvent('telegram_webhook_url_missing', {
            mode: this.mode,
          }));
          return;
        }

        await this.bot.telegram.setWebhook(webhookUrl, {
          secret_token: webhookSecret,
        });

        this.logger.log(`Telegram bot configured for webhook mode: ${webhookUrl}`);
        return;
      }

      await this.bot.launch();
      this.isLaunched = true;
      this.logger.log('Telegram bot launched in polling mode.');
    } catch (error) {
      const err = toLogErrorDetails(error);
      this.logger.error(formatErrorLogEvent('telegram_launch_failed', error, { mode: this.mode }), err.stack);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.mode === 'polling' && this.isLaunched) {
      await this.bot.stop('module_destroy');
      this.logger.log('Telegram bot stopped.');
    }
  }

  private async syncCommands(): Promise<void> {
    try {
      await this.bot.telegram.setMyCommands([...TELEGRAM_COMMANDS]);
      this.logger.log('Telegram commands registered.');
    } catch (error) {
      this.logger.warn(formatErrorLogEvent('telegram_commands_sync_failed', error, {
        commandsCount: TELEGRAM_COMMANDS.length,
      }));
    }
  }
}
