import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventType, type Event } from '@prisma/client';

import { TEXT_LIMITS } from '../common/constants/app.constants';
import { buildNormalizedEntryDate } from '../common/utils/date.utils';
import { parseIntegerScore } from '../common/utils/validation.utils';
import { EventsRepository } from './events.repository';
import type { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class EventsService {
  private readonly defaultTimezone: string;

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly configService: ConfigService,
  ) {
    this.defaultTimezone =
      this.configService.get<string>('app.defaultTimezone', { infer: true }) ?? 'Europe/Berlin';
  }

  createEvent(userId: string, dto: CreateEventDto): Promise<Event> {
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

  linkEventToEntry(eventId: string, dailyEntryId: string): Promise<Event> {
    return this.eventsRepository.update(eventId, {
      dailyEntry: {
        connect: { id: dailyEntryId },
      },
    });
  }

  getEventsForPeriod(userId: string, from: Date, to: Date): Promise<Event[]> {
    return this.eventsRepository.findByUserAndPeriod(userId, from, to);
  }

  getEventsForDay(userId: string, date: Date): Promise<Event[]> {
    return this.eventsRepository.findByUserAndDay(userId, date);
  }

  buildEventDate(
    referenceDate: Date,
    userTimezone: string | null | undefined,
    fallbackTimezone?: string,
  ): Date {
    return buildNormalizedEntryDate(
      referenceDate,
      userTimezone ?? undefined,
      fallbackTimezone ?? this.defaultTimezone,
    );
  }

  validateEventType(value: string): EventType | null {
    return Object.values(EventType).includes(value as EventType) ? (value as EventType) : null;
  }

  validateEventTitle(value: string): string | null {
    const title = value.trim();

    if (!title || title.length > TEXT_LIMITS.eventTitle) {
      return null;
    }

    return title;
  }

  validateEventDescription(value: string): string | null {
    const description = value.trim();

    if (!description || description.length > TEXT_LIMITS.eventDescription) {
      return null;
    }

    return description;
  }

  validateEventScore(value: string | number): number | null {
    if (typeof value === 'number') {
      return Number.isInteger(value) && value >= 0 && value <= 10 ? value : null;
    }

    return parseIntegerScore(value);
  }
}
