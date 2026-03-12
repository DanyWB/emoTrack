import { buildEvent } from '../helpers/in-memory';
import {
  buildRepeatedEventDates,
  doesEventOverlapDay,
  doesEventOverlapRange,
  resolveEventInclusiveEndDate,
} from '../../src/events/events.utils';
import { EVENT_REPEAT_MODES } from '../../src/events/events.constants';

describe('events.utils', () => {
  it('treats a null end date as a single-day event', () => {
    const event = buildEvent({
      eventDate: new Date('2026-03-11T00:00:00.000Z'),
      eventEndDate: null,
    });

    expect(resolveEventInclusiveEndDate(event)).toEqual(new Date('2026-03-11T00:00:00.000Z'));
    expect(doesEventOverlapDay(event, new Date('2026-03-11T00:00:00.000Z'))).toBe(true);
    expect(doesEventOverlapDay(event, new Date('2026-03-12T00:00:00.000Z'))).toBe(false);
  });

  it('uses inclusive overlap semantics for multi-day events', () => {
    const event = buildEvent({
      eventDate: new Date('2026-03-10T00:00:00.000Z'),
      eventEndDate: new Date('2026-03-12T00:00:00.000Z'),
    });

    expect(doesEventOverlapDay(event, new Date('2026-03-10T00:00:00.000Z'))).toBe(true);
    expect(doesEventOverlapDay(event, new Date('2026-03-11T00:00:00.000Z'))).toBe(true);
    expect(doesEventOverlapDay(event, new Date('2026-03-12T00:00:00.000Z'))).toBe(true);
    expect(doesEventOverlapDay(event, new Date('2026-03-13T00:00:00.000Z'))).toBe(false);
    expect(
      doesEventOverlapRange(
        event,
        new Date('2026-03-12T00:00:00.000Z'),
        new Date('2026-03-14T00:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      doesEventOverlapRange(
        event,
        new Date('2026-03-13T00:00:00.000Z'),
        new Date('2026-03-14T00:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('expands daily repeats using the total occurrence count, including the first event', () => {
    const dates = buildRepeatedEventDates(
      new Date('2026-03-11T00:00:00.000Z'),
      EVENT_REPEAT_MODES.daily,
      3,
    );

    expect(dates).toEqual([
      new Date('2026-03-11T00:00:00.000Z'),
      new Date('2026-03-12T00:00:00.000Z'),
      new Date('2026-03-13T00:00:00.000Z'),
    ]);
  });

  it('expands weekly repeats using the total occurrence count, including the first event', () => {
    const dates = buildRepeatedEventDates(
      new Date('2026-03-11T00:00:00.000Z'),
      EVENT_REPEAT_MODES.weekly,
      2,
    );

    expect(dates).toEqual([
      new Date('2026-03-11T00:00:00.000Z'),
      new Date('2026-03-18T00:00:00.000Z'),
    ]);
  });

  it('rejects bounded repeat counts outside the allowed total occurrence range', () => {
    expect(() =>
      buildRepeatedEventDates(new Date('2026-03-11T00:00:00.000Z'), EVENT_REPEAT_MODES.daily, 1),
    ).toThrow('INVALID_EVENT_REPEAT_COUNT');
    expect(() =>
      buildRepeatedEventDates(new Date('2026-03-11T00:00:00.000Z'), EVENT_REPEAT_MODES.weekly, 8),
    ).toThrow('INVALID_EVENT_REPEAT_COUNT');
  });
});
