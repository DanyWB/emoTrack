import { Module } from '@nestjs/common';
import { CheckinsModule } from '../checkins/checkins.module';
import { EventsModule } from '../events/events.module';

import { StatsService } from './stats.service';

@Module({
  imports: [CheckinsModule, EventsModule],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
