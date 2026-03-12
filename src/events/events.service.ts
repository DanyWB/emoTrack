import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventType, type Event } from '@prisma/client';

import { TEXT_LIMITS } from '../common/constants/app.constants';
import { buildNormalizedEntryDate, normalizeDayKeyToUtcDate } from '../common/utils/date.utils';
import { parseDateKey, parseIntegerScore } from '../common/utils/validation.utils';
import {
  EVENT_REPEAT_MAX_OCCURRENCES,
  EVENT_REPEAT_MIN_OCCURRENCES,
  EVENT_REPEAT_MODES,
  type EventRepeatMode,
} from './events.constants';
import { buildRepeatedEventDates } from './events.utils';
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
    const eventDate = new Date(dto.eventDate);
    const eventEndDate = dto.eventEndDate ? new Date(dto.eventEndDate) : null;

    if (eventEndDate && eventEndDate.getTime() < eventDate.getTime()) {
      throw new Error('INVALID_EVENT_END_DATE');
    }

    return this.eventsRepository.create({
      userId,
      dailyEntryId: dto.dailyEntryId,
      eventDate,
      eventEndDate: eventEndDate ?? undefined,
      seriesId: dto.seriesId,
      seriesPosition: dto.seriesPosition,
      eventType: dto.eventType,
      title: dto.title,
      description: dto.description,
      eventScore: dto.eventScore,
    });
  }

  async createRepeatedStandaloneEvents(
    userId: string,
    dto: CreateEventDto,
    repeatMode: EventRepeatMode,
    totalOccurrences: number,
    seriesId: string,
  ): Promise<Event[]> {
    const eventDate = new Date(dto.eventDate);

    if (dto.eventEndDate) {
      throw new Error('INVALID_EVENT_REPEAT_CONFIGURATION');
    }

    if (repeatMode !== EVENT_REPEAT_MODES.daily && repeatMode !== EVENT_REPEAT_MODES.weekly) {
      throw new Error('INVALID_EVENT_REPEAT_MODE');
    }

    if (!seriesId.trim()) {
      throw new Error('INVALID_EVENT_SERIES_ID');
    }

    const eventDates = buildRepeatedEventDates(eventDate, repeatMode, totalOccurrences);

    return this.eventsRepository.createRepeatedSeries(
      userId,
      eventDates.map((occurrenceDate, index) => ({
        userId,
        dailyEntryId: dto.dailyEntryId,
        eventDate: occurrenceDate,
        eventType: dto.eventType,
        title: dto.title,
        description: dto.description,
        eventScore: dto.eventScore,
        seriesId,
        seriesPosition: index + 1,
      })),
      seriesId,
      totalOccurrences,
    );
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

  buildEventDateFromDayKey(dayKey: string): Date {
    return normalizeDayKeyToUtcDate(dayKey);
  }

  generateSeriesId(): string {
    return randomUUID();
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

  validateEventEndDate(value: string, eventStartDate: Date): Date | null {
    const dateKey = parseDateKey(value);

    if (!dateKey) {
      return null;
    }

    const eventEndDate = normalizeDayKeyToUtcDate(dateKey);

    if (eventEndDate.getTime() < eventStartDate.getTime()) {
      return null;
    }

    return eventEndDate;
  }

  validateEventRepeatMode(value: string): EventRepeatMode | null {
    return Object.values(EVENT_REPEAT_MODES).includes(value as EventRepeatMode)
      ? (value as EventRepeatMode)
      : null;
  }

  validateEventRepeatCount(value: string | number): number | null {
    const parsed = typeof value === 'number' ? value : Number(value);

    if (
      !Number.isInteger(parsed) ||
      parsed < EVENT_REPEAT_MIN_OCCURRENCES ||
      parsed > EVENT_REPEAT_MAX_OCCURRENCES
    ) {
      return null;
    }

    return parsed;
  }
}
