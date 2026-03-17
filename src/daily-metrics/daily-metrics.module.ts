import { Module } from '@nestjs/common';

import { DailyMetricsRepository } from './daily-metrics.repository';
import { DailyMetricsService } from './daily-metrics.service';

@Module({
  providers: [DailyMetricsRepository, DailyMetricsService],
  exports: [DailyMetricsRepository, DailyMetricsService],
})
export class DailyMetricsModule {}
