import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DailyMetricsModule } from '../daily-metrics/daily-metrics.module';
import { EventsModule } from '../events/events.module';
import { FsmModule } from '../fsm/fsm.module';
import { TagsModule } from '../tags/tags.module';

import { CheckinsRepository } from './checkins.repository';
import { CheckinsService } from './checkins.service';
import { CheckinsFlowService } from './checkins.flow';

@Module({
  imports: [ConfigModule, FsmModule, AnalyticsModule, TagsModule, EventsModule, DailyMetricsModule],
  providers: [CheckinsRepository, CheckinsService, CheckinsFlowService],
  exports: [CheckinsRepository, CheckinsService, CheckinsFlowService],
})
export class CheckinsModule {}
