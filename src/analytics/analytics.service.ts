import { Injectable, Logger } from '@nestjs/common';

import { AnalyticsRepository } from './analytics.repository';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async track(eventName: string, payload: Record<string, unknown> = {}, userId?: string): Promise<void> {
    try {
      await this.analyticsRepository.create(eventName, payload, userId);
    } catch (error) {
      this.logger.warn(`Failed to track event ${eventName}: ${(error as Error).message}`);
    }
  }
}
