import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

export function resolveTimezone(
  userTimezone: string | null | undefined,
  fallbackTimezone: string,
): string {
  const candidate = userTimezone?.trim() || fallbackTimezone;

  try {
    dayjs().tz(candidate);
    return candidate;
  } catch {
    return fallbackTimezone;
  }
}

export function buildDayKey(referenceDate: Date, timezoneName: string): string {
  return dayjs(referenceDate).tz(timezoneName).format('YYYY-MM-DD');
}

export function normalizeDayKeyToUtcDate(dayKey: string): Date {
  return dayjs.utc(`${dayKey}T00:00:00.000Z`).toDate();
}

export function buildNormalizedEntryDate(
  referenceDate: Date,
  userTimezone: string | null | undefined,
  fallbackTimezone: string,
): Date {
  const timezoneName = resolveTimezone(userTimezone, fallbackTimezone);
  const dayKey = buildDayKey(referenceDate, timezoneName);
  return normalizeDayKeyToUtcDate(dayKey);
}

export function formatDateKey(date: Date): string {
  return dayjs.utc(date).format('YYYY-MM-DD');
}
