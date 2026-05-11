import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

import { PrismaService } from '../../src/database/prisma.service';
import { RedisService } from '../../src/database/redis.service';
import { HealthController } from '../../src/health/health.controller';
import { HealthService } from '../../src/health/health.service';
import { TelegramRuntimeStatusService, type TelegramRuntimeSnapshot } from '../../src/telegram/telegram.runtime-status';

interface HealthTestOptions {
  redisEnabled?: boolean;
  jobsEnabled?: boolean;
  databaseOk?: boolean;
  redisOk?: boolean;
  redisClientPresent?: boolean;
  telegramSnapshot?: Partial<TelegramRuntimeSnapshot>;
}

async function createHealthApp(options: HealthTestOptions = {}): Promise<{
  app: INestApplication;
  prismaService: { $queryRawUnsafe: jest.Mock };
  redisClient: { ping: jest.Mock };
}> {
  const prismaService = {
    $queryRawUnsafe: jest
      .fn()
      .mockImplementation(() =>
        options.databaseOk === false ? Promise.reject(new Error('db unavailable')) : Promise.resolve([{ '?column?': 1 }]),
      ),
  };
  const redisClient = {
    ping: jest
      .fn()
      .mockImplementation(() =>
        options.redisOk === false ? Promise.reject(new Error('redis unavailable')) : Promise.resolve('PONG'),
      ),
  };
  const redisClientPresent =
    options.redisClientPresent ?? Boolean(options.redisEnabled || options.jobsEnabled);
  const redisService = {
    getClient: jest.fn().mockReturnValue(redisClientPresent ? redisClient : null),
    isEnabled: jest.fn().mockReturnValue(redisClientPresent),
  };
  const telegramRuntimeStatus = {
    getSnapshot: jest.fn().mockReturnValue({
      status: 'skipped',
      mode: 'polling',
      required: false,
      reason: 'token_placeholder',
      updatedAt: '2026-03-12T10:00:00.000Z',
      ...options.telegramSnapshot,
    } satisfies TelegramRuntimeSnapshot),
  };
  const configService = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'app.redisEnabled':
          return options.redisEnabled ?? false;
        case 'app.jobsEnabled':
          return options.jobsEnabled ?? false;
        default:
          return undefined;
      }
    }),
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: ConfigService, useValue: configService },
      { provide: PrismaService, useValue: prismaService },
      { provide: RedisService, useValue: redisService },
      { provide: TelegramRuntimeStatusService, useValue: telegramRuntimeStatus },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, prismaService, redisClient };
}

describe('Health integration', () => {
  it('returns lightweight process liveness from /health/live', async () => {
    const { app } = await createHealthApp();

    try {
      const response = await request(app.getHttpServer()).get('/health/live').expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'ok',
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('returns readiness with Redis skipped in the accepted local no-Docker mode', async () => {
    const { app, prismaService, redisClient } = await createHealthApp({
      redisEnabled: false,
      jobsEnabled: false,
    });

    try {
      const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'ok',
          mode: {
            redisEnabled: false,
            jobsEnabled: false,
            redisRequired: false,
          },
          checks: {
            database: { status: 'up' },
            redis: { status: 'skipped' },
            telegram: {
              status: 'skipped',
              message: 'token_placeholder',
            },
          },
        }),
      );
      expect(prismaService.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
      expect(redisClient.ping).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('requires Redis readiness only when Redis or jobs are enabled', async () => {
    const { app, redisClient } = await createHealthApp({
      redisEnabled: true,
      jobsEnabled: true,
      redisOk: true,
    });

    try {
      const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'ok',
          mode: {
            redisEnabled: true,
            jobsEnabled: true,
            redisRequired: true,
          },
          checks: {
            database: { status: 'up' },
            redis: { status: 'up' },
            telegram: {
              status: 'skipped',
              message: 'token_placeholder',
            },
          },
        }),
      );
      expect(redisClient.ping).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('returns 503 from /health/ready when the required database check fails', async () => {
    const { app } = await createHealthApp({
      databaseOk: false,
    });

    try {
      const response = await request(app.getHttpServer()).get('/health/ready').expect(503);

      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'error',
          checks: expect.objectContaining({
            database: expect.objectContaining({
              status: 'down',
            }),
          }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('returns 503 from /health/ready when the required Telegram runtime failed', async () => {
    const { app } = await createHealthApp({
      telegramSnapshot: {
        status: 'failed',
        mode: 'webhook',
        required: true,
        reason: 'telegram_runtime_failed',
        errorMessage: 'setWebhook failed',
      },
    });

    try {
      const response = await request(app.getHttpServer()).get('/health/ready').expect(503);

      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'error',
          checks: expect.objectContaining({
            telegram: expect.objectContaining({
              status: 'down',
              message: 'setWebhook failed',
            }),
          }),
        }),
      );
    } finally {
      await app.close();
    }
  });
});
