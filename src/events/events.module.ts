import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsModule } from '../analytics/analytics.module';
import { FsmModule } from '../fsm/fsm.module';

import { EventsFlowService } from './events.flow';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

@Module({
  imports: [ConfigModule, FsmModule, AnalyticsModule],
  providers: [EventsRepository, EventsService, EventsFlowService],
  exports: [EventsRepository, EventsService, EventsFlowService],
})
export class EventsModule {}
