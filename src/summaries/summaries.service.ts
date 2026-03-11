import { Injectable, Logger } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { StatsService } from '../stats/stats.service';
import { type PeriodStatsPayload } from '../stats/stats.types';
import { SummariesFormatter } from './summaries.formatter';
import { SummariesRepository } from './summaries.repository';
import { type SummaryGenerateOptions } from './summaries.types';

@Injectable()
export class SummariesService {
  private readonly logger = new Logger(SummariesService.name);

  constructor(
    private readonly summariesRepository: SummariesRepository,
    private readonly summariesFormatter: SummariesFormatter,
    private readonly statsService: StatsService,
  ) {}

  async generateSummary(
    userId: string,
    periodType: PeriodStatsPayload['periodType'],
    options: SummaryGenerateOptions = {},
  ): Promise<PeriodStatsPayload> {
    const payload = await this.statsService.buildPeriodStats(userId, periodType, {
      timezone: options.timezone,
    });

    if (options.persist ?? true) {
      try {
        await this.persistSummary(userId, payload);
      } catch (error) {
        this.logger.warn(`Failed to persist summary: ${(error as Error).message}`);
      }
    }

    return payload;
  }

  persistSummary(userId: string, payload: PeriodStatsPayload) {
    return this.summariesRepository.create({
      userId,
      periodType: payload.periodType,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      payloadJson: payload as unknown as Prisma.InputJsonValue,
    });
  }

  formatSummaryText(payload: PeriodStatsPayload): string {
    return this.summariesFormatter.formatSummaryText(payload);
  }
}
