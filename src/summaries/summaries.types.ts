import type { SummaryPeriodType } from '@prisma/client';

import type { PeriodStatsPayload } from '../stats/stats.types';

export type SummaryPayload = PeriodStatsPayload;

export interface SummaryGenerateOptions {
  timezone?: string | null;
  persist?: boolean;
}

export interface SummaryTextContext {
  periodType: SummaryPeriodType;
  payload: SummaryPayload;
}
