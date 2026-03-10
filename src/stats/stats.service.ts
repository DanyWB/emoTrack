import { Injectable } from '@nestjs/common';
import { SummaryPeriodType } from '@prisma/client';

@Injectable()
export class StatsService {
  buildPeriodStats(_userId: string, _periodType: SummaryPeriodType): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }

  calculateAverages(_entries: unknown[]): Record<string, number | null> {
    return {
      mood: null,
      energy: null,
      stress: null,
    };
  }

  findBestDay(_entries: unknown[]): unknown {
    return null;
  }

  findWorstDay(_entries: unknown[]): unknown {
    return null;
  }

  buildEventBreakdown(_events: unknown[]): Record<string, number> {
    return {};
  }

  calculateDeltaVsPrevious(_userId: string, _periodType: SummaryPeriodType): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }
}
