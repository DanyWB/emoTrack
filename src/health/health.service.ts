import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../database/redis.service';

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
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
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
    };

    try {
      await this.prismaService.$queryRawUnsafe('SELECT 1');
    } catch (error) {
      const err = error as Error;
      checks.database = {
        status: 'down',
        message: err.message,
      };
      this.logger.warn(`Readiness database check failed: ${err.message}`);
    }

    if (mode.redisRequired) {
      const redisClient = this.redisService.getClient();

      if (!redisClient) {
        checks.redis = {
          status: 'down',
          message: 'Redis client is unavailable.',
        };
        this.logger.warn('Readiness Redis check failed: Redis client is unavailable.');
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
          this.logger.warn(`Readiness Redis check failed: ${err.message}`);
        }
      }
    }

    const payload: ReadinessPayload = {
      status:
        checks.database.status === 'up' && (!mode.redisRequired || checks.redis.status === 'up')
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
}
