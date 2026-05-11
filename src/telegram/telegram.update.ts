import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, type Context } from 'telegraf';

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
      this.logger.warn('Telegram launch skipped (token placeholder or test environment).');
      return;
    }

    try {
      await this.syncCommands();

      if (this.mode === 'webhook') {
        const webhookUrl = this.configService.get<string>('telegram.webhookUrl', { infer: true });
        const webhookSecret = this.configService.get<string>('telegram.webhookSecret', { infer: true });

        if (!webhookUrl) {
          this.logger.warn('Webhook mode selected, but TELEGRAM_WEBHOOK_URL is missing.');
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
      const err = error as Error;
      this.logger.error(`Failed to launch Telegram bot: ${err.message}`, err.stack);
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
      const err = error as Error;
      this.logger.warn(`Failed to register Telegram commands: ${err.message}`);
    }
  }
}
