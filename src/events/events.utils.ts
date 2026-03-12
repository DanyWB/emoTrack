import {
  EVENT_REPEAT_MAX_OCCURRENCES,
  EVENT_REPEAT_MIN_OCCURRENCES,
  EVENT_REPEAT_MODES,
  type EventRepeatMode,
} from './events.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EventDateRangeLike {
  eventDate: Date;
  eventEndDate?: Date | null;
}

export function resolveEventInclusiveEndDate(event: EventDateRangeLike): Date {
  return event.eventEndDate ?? event.eventDate;
}

export function doesEventOverlapDay(event: EventDateRangeLike, day: Date): boolean {
  return doesEventOverlapRange(event, day, day);
}

export function doesEventOverlapRange(
  event: EventDateRangeLike,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const eventStart = event.eventDate.getTime();
  const eventEnd = resolveEventInclusiveEndDate(event).getTime();
  const start = rangeStart.getTime();
  const end = rangeEnd.getTime();

  return eventStart <= end && eventEnd >= start;
}

export function buildRepeatedEventDates(
  startDate: Date,
  repeatMode: EventRepeatMode,
  totalOccurrences: number,
): Date[] {
  if (repeatMode === EVENT_REPEAT_MODES.none) {
    return [startDate];
  }

  if (
    !Number.isInteger(totalOccurrences) ||
    totalOccurrences < EVENT_REPEAT_MIN_OCCURRENCES ||
    totalOccurrences > EVENT_REPEAT_MAX_OCCURRENCES
  ) {
    throw new Error('INVALID_EVENT_REPEAT_COUNT');
  }

  const stepDays = repeatMode === EVENT_REPEAT_MODES.daily ? 1 : 7;

  return Array.from({ length: totalOccurrences }, (_, index) => {
    return new Date(startDate.getTime() + index * stepDays * DAY_MS);
  });
}
