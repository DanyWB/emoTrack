import { registerAs } from '@nestjs/config';

export type TelegramMode = 'polling' | 'webhook';

export interface TelegramConfig {
  botToken: string;
  mode: TelegramMode;
  webhookUrl?: string;
  webhookSecret?: string;
  startupTimeoutMs: number;
}

export default registerAs(
  'telegram',
  (): TelegramConfig => ({
    botToken: process.env.TELEGRAM_BOT_TOKEN as string,
    mode: (process.env.TELEGRAM_MODE as TelegramMode | undefined) ?? 'polling',
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || undefined,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
    startupTimeoutMs: Number(process.env.TELEGRAM_STARTUP_TIMEOUT_MS ?? 10000),
  }),
);
