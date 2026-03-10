import { Injectable } from '@nestjs/common';

import { EventsRepository } from './events.repository';
import type { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly eventsRepository: EventsRepository) {}

  createEvent(userId: string, dto: CreateEventDto) {
    return this.eventsRepository.create({
      userId,
      dailyEntryId: dto.dailyEntryId,
      eventDate: new Date(dto.eventDate),
      eventType: dto.eventType,
      title: dto.title,
      description: dto.description,
      eventScore: dto.eventScore,
    });
  }

  linkEventToEntry(eventId: string, dailyEntryId: string) {
    return this.eventsRepository.update(eventId, {
      dailyEntry: {
        connect: { id: dailyEntryId },
      },
    });
  }

  getEventsForPeriod(_userId: string, _from: Date, _to: Date): Promise<unknown[]> {
    return Promise.resolve([]);
  }

  getEventsForDay(_userId: string, _date: Date): Promise<unknown[]> {
    return Promise.resolve([]);
  }
}
