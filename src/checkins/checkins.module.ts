import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsModule } from '../analytics/analytics.module';
import { FsmModule } from '../fsm/fsm.module';

import { CheckinsRepository } from './checkins.repository';
import { CheckinsService } from './checkins.service';
import { CheckinsFlowService } from './checkins.flow';

@Module({
  imports: [ConfigModule, FsmModule, AnalyticsModule],
  providers: [CheckinsRepository, CheckinsService, CheckinsFlowService],
  exports: [CheckinsRepository, CheckinsService, CheckinsFlowService],
})
export class CheckinsModule {}
