import { Injectable, Logger } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { formatErrorLogEvent } from '../common/utils/logging.utils';
import { StatsService } from '../stats/stats.service';
import { type PeriodStatsPayload, type SelectedMetricStatsPayload, type StatsSelectedMetricKey } from '../stats/stats.types';
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
        this.logger.warn(formatErrorLogEvent('summary_persist_failed', error, {
          userId,
          periodType,
          periodStart: payload.periodStart,
          periodEnd: payload.periodEnd,
        }));
      }
    }

    this.logger.log(
      `Generated summary for user ${userId}: period=${periodType}, entries=${payload.entriesCount}, events=${payload.eventsCount}`,
    );

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

  formatWeeklyDigestText(payload: PeriodStatsPayload): string {
    return this.summariesFormatter.formatWeeklyDigestText(payload);
  }

  async generateSelectedMetricSummary(
    userId: string,
    periodType: PeriodStatsPayload['periodType'],
    metricKey: StatsSelectedMetricKey,
    options: SummaryGenerateOptions = {},
  ): Promise<SelectedMetricStatsPayload> {
    const payload = await this.generateSummary(userId, periodType, options);
    return this.statsService.buildSelectedMetricStatsFromPayload(userId, payload, metricKey);
  }

  formatSelectedMetricSummaryText(payload: SelectedMetricStatsPayload): string {
    return this.summariesFormatter.formatSelectedMetricSummaryText(payload);
  }
}
