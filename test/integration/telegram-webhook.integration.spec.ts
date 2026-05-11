import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

import { TELEGRAM_BOT } from '../../src/telegram/telegram.tokens';
import { TelegramWebhookController } from '../../src/telegram/telegram.webhook.controller';

async function createWebhookApp(options: {
  mode?: 'polling' | 'webhook';
  webhookSecret?: string;
} = {}): Promise<{
  app: INestApplication;
  bot: { handleUpdate: jest.Mock };
  moduleRef: TestingModule;
}> {
  const bot = {
    handleUpdate: jest.fn().mockResolvedValue(undefined),
  };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        'telegram.mode': options.mode ?? 'webhook',
        'telegram.webhookSecret': options.webhookSecret,
      };

      return values[key];
    }),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [TelegramWebhookController],
    providers: [
      { provide: TELEGRAM_BOT, useValue: bot },
      { provide: ConfigService, useValue: configService },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, bot, moduleRef };
}

describe('Telegram webhook integration', () => {
  it('dispatches webhook updates when the secret token matches', async () => {
    const { app, bot } = await createWebhookApp({
      mode: 'webhook',
      webhookSecret: 'expected-secret',
    });
    const update = {
      update_id: 123,
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 100, type: 'private' },
        text: '/start',
      },
    };

    try {
      await request(app.getHttpServer())
        .post('/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', 'expected-secret')
        .send(update)
        .expect(200, { ok: true });

      expect(bot.handleUpdate).toHaveBeenCalledWith(update);
    } finally {
      await app.close();
    }
  });

  it('rejects webhook updates when the configured secret token does not match', async () => {
    const { app, bot } = await createWebhookApp({
      mode: 'webhook',
      webhookSecret: 'expected-secret',
    });

    try {
      await request(app.getHttpServer())
        .post('/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', 'wrong-secret')
        .send({ update_id: 124 })
        .expect(401);

      expect(bot.handleUpdate).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('does not dispatch webhook updates while polling mode is active', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { app, bot } = await createWebhookApp({
      mode: 'polling',
      webhookSecret: 'expected-secret',
    });

    try {
      await request(app.getHttpServer())
        .post('/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', 'expected-secret')
        .send({ update_id: 125 })
        .expect(200, { ok: true, skipped: true });

      expect(bot.handleUpdate).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('event=telegram_webhook_update_skipped'));
    } finally {
      warnSpy.mockRestore();
      await app.close();
    }
  });
});
