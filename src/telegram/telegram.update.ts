import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, type Context } from 'telegraf';

import { formatErrorLogEvent, formatLogEvent, toLogErrorDetails } from '../common/utils/logging.utils';
import type { TelegramConfig, TelegramMode } from '../config/telegram.config';
import { TELEGRAM_COMMANDS } from './telegram.copy';
import { TelegramRouter } from './telegram.router';
import { TelegramRuntimeStatusService } from './telegram.runtime-status';
import { TELEGRAM_BOT } from './telegram.tokens';

const DEFAULT_TELEGRAM_STARTUP_TIMEOUT_MS = 10000;

@Injectable()
export class TelegramUpdate implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramUpdate.name);
  private isLaunched = false;
  private mode: TelegramMode = 'polling';

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: Telegraf<Context>,
    private readonly telegramRouter: TelegramRouter,
    private readonly configService: ConfigService,
    private readonly telegramRuntimeStatus: TelegramRuntimeStatusService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.telegramRouter.register(this.bot);

    const token = this.configService.get<string>('telegram.botToken');
    this.mode =
      (this.configService.get<string>('telegram.mode', { infer: true }) as TelegramMode | undefined) ??
      'polling';
    const nodeEnv = this.configService.get<string>('app.nodeEnv');
    const skipReason = this.resolveLaunchSkipReason(token, nodeEnv);

    this.telegramRuntimeStatus.markStarting(this.mode, !skipReason);

    if (skipReason) {
      this.telegramRuntimeStatus.markSkipped(this.mode, skipReason);
      this.logger.warn(formatLogEvent('telegram_launch_skipped', {
        reason: skipReason,
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
          const error = new Error('TELEGRAM_WEBHOOK_URL is required in webhook mode.');
          this.telegramRuntimeStatus.markFailed(this.mode, error, 'webhook_url_missing');
          this.logger.warn(formatLogEvent('telegram_webhook_url_missing', {
            mode: this.mode,
          }));
          return;
        }

        await this.withStartupTimeout(
          this.bot.telegram.setWebhook(
            webhookUrl,
            webhookSecret ? { secret_token: webhookSecret } : undefined,
          ),
          'setWebhook',
        );

        this.logger.log(`Telegram bot configured for webhook mode: ${webhookUrl}`);
        this.telegramRuntimeStatus.markReady(this.mode);
        return;
      }

      await this.withStartupTimeout(this.bot.launch(), 'launch');
      this.isLaunched = true;
      this.telegramRuntimeStatus.markReady(this.mode);
      this.logger.log('Telegram bot launched in polling mode.');
    } catch (error) {
      const err = toLogErrorDetails(error);
      this.telegramRuntimeStatus.markFailed(this.mode, error);
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
      await this.withStartupTimeout(this.bot.telegram.setMyCommands([...TELEGRAM_COMMANDS]), 'setMyCommands');
      this.logger.log('Telegram commands registered.');
    } catch (error) {
      this.logger.warn(formatErrorLogEvent('telegram_commands_sync_failed', error, {
        commandsCount: TELEGRAM_COMMANDS.length,
      }));
    }
  }

  private resolveLaunchSkipReason(token: string | undefined, nodeEnv: string | undefined): string | null {
    if (!token || token.startsWith('replace_with_')) {
      return 'token_placeholder';
    }

    if (nodeEnv === 'test') {
      return 'test_environment';
    }

    return null;
  }

  private async withStartupTimeout<T>(operation: Promise<T>, operationName: string): Promise<T> {
    const timeoutMs = this.resolveStartupTimeoutMs();
    let timeout: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Telegram startup operation timed out: ${operationName} after ${timeoutMs}ms.`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private resolveStartupTimeoutMs(): number {
    const telegram = this.configService.get<TelegramConfig>('telegram', { infer: true });
    const timeoutMs = telegram?.startupTimeoutMs ?? DEFAULT_TELEGRAM_STARTUP_TIMEOUT_MS;

    if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
      return DEFAULT_TELEGRAM_STARTUP_TIMEOUT_MS;
    }

    return timeoutMs;
  }
}
