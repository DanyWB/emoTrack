import { Injectable } from '@nestjs/common';
import { SummaryPeriodType, type Prisma } from '@prisma/client';

import { SummariesFormatter } from './summaries.formatter';
import { SummariesRepository } from './summaries.repository';

@Injectable()
export class SummariesService {
  constructor(
    private readonly summariesRepository: SummariesRepository,
    private readonly summariesFormatter: SummariesFormatter,
  ) {}

  generateSummary(_userId: string, periodType: SummaryPeriodType): Promise<Record<string, unknown>> {
    return Promise.resolve({ periodType });
  }

  persistSummary(userId: string, payload: Record<string, unknown>) {
    return this.summariesRepository.create({
      userId,
      periodType: SummaryPeriodType.d7,
      periodStart: new Date(),
      periodEnd: new Date(),
      payloadJson: payload as Prisma.InputJsonValue,
    });
  }

  formatSummaryText(payload: Record<string, unknown>): string {
    return this.summariesFormatter.formatSummaryText(payload);
  }
}
