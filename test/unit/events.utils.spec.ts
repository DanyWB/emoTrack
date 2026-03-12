import { buildEvent } from '../helpers/in-memory';
import {
  doesEventOverlapDay,
  doesEventOverlapRange,
  resolveEventInclusiveEndDate,
} from '../../src/events/events.utils';

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
});
