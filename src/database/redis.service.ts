import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import type Redis from 'ioredis';

import { formatErrorLogEvent, toLogErrorDetails } from '../common/utils/logging.utils';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Optional() @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null) {}

  async onModuleInit(): Promise<void> {
    if (!this.redisClient) {
      this.logger.log('Redis is disabled by configuration.');
      return;
    }

    try {
      const pingResult = await this.redisClient.ping();
      this.logger.log(`Redis connection established (${pingResult})`);
    } catch (error) {
      const err = toLogErrorDetails(error);
      this.logger.error(formatErrorLogEvent('redis_connection_failed', error), err.stack);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    await this.redisClient.quit();
    this.logger.log('Redis connection closed');
  }

  isEnabled(): boolean {
    return !!this.redisClient;
  }

  getClient(): Redis | null {
    return this.redisClient;
  }
}
