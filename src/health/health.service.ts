import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { formatErrorLogEvent, formatLogEvent } from '../common/utils/logging.utils';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../database/redis.service';
import { TelegramRuntimeStatusService } from '../telegram/telegram.runtime-status';

type HealthStatus = 'up' | 'down' | 'skipped';

interface HealthCheckResult {
  status: HealthStatus;
  message?: string;
}

interface HealthModeInfo {
  redisEnabled: boolean;
  jobsEnabled: boolean;
  redisRequired: boolean;
}

export interface LivenessPayload {
  status: 'ok';
  timestamp: string;
}

export interface ReadinessPayload {
  status: 'ok' | 'error';
  timestamp: string;
  mode: HealthModeInfo;
  checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
    telegram: HealthCheckResult;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly telegramRuntimeStatus: TelegramRuntimeStatusService,
  ) {}

  getLiveness(): LivenessPayload {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessPayload> {
    const mode = this.resolveMode();
    const checks: ReadinessPayload['checks'] = {
      database: { status: 'up' },
      redis: mode.redisRequired ? { status: 'down', message: 'Redis check not started.' } : { status: 'skipped' },
      telegram: this.resolveTelegramReadiness(),
    };

    try {
      await this.prismaService.$queryRawUnsafe('SELECT 1');
    } catch (error) {
      const err = error as Error;
      checks.database = {
        status: 'down',
        message: err.message,
      };
      this.logger.warn(formatErrorLogEvent('readiness_database_check_failed', error));
    }

    if (mode.redisRequired) {
      const redisClient = this.redisService.getClient();

      if (!redisClient) {
        checks.redis = {
          status: 'down',
          message: 'Redis client is unavailable.',
        };
        this.logger.warn(formatLogEvent('readiness_redis_check_failed', {
          reason: 'redis_client_unavailable',
        }));
      } else {
        try {
          await redisClient.ping();
          checks.redis = { status: 'up' };
        } catch (error) {
          const err = error as Error;
          checks.redis = {
            status: 'down',
            message: err.message,
          };
          this.logger.warn(formatErrorLogEvent('readiness_redis_check_failed', error));
        }
      }
    }

    const payload: ReadinessPayload = {
      status:
        checks.database.status === 'up' &&
        (!mode.redisRequired || checks.redis.status === 'up') &&
        checks.telegram.status !== 'down'
          ? 'ok'
          : 'error',
      timestamp: new Date().toISOString(),
      mode,
      checks,
    };

    if (payload.status === 'error') {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }

  private resolveMode(): HealthModeInfo {
    const redisEnabled = this.configService.get<boolean>('app.redisEnabled', { infer: true }) ?? false;
    const jobsEnabled = this.configService.get<boolean>('app.jobsEnabled', { infer: true }) ?? false;

    return {
      redisEnabled,
      jobsEnabled,
      redisRequired: redisEnabled || jobsEnabled,
    };
  }

  private resolveTelegramReadiness(): HealthCheckResult {
    const snapshot = this.telegramRuntimeStatus.getSnapshot();

    if (snapshot.status === 'ready') {
      return { status: 'up' };
    }

    if (snapshot.status === 'skipped') {
      return {
        status: 'skipped',
        message: snapshot.reason,
      };
    }

    if (snapshot.status === 'failed') {
      return {
        status: 'down',
        message: snapshot.errorMessage ?? snapshot.reason ?? 'Telegram runtime failed.',
      };
    }

    if (snapshot.required) {
      return {
        status: 'down',
        message: 'Telegram runtime is not ready.',
      };
    }

    return {
      status: 'skipped',
      message: 'Telegram runtime is not required.',
    };
  }
}
