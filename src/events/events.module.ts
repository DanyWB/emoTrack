import { Module } from '@nestjs/common';

import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

@Module({
  providers: [EventsRepository, EventsService],
  exports: [EventsRepository, EventsService],
})
export class EventsModule {}
