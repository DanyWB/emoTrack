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
