import dayjs = require('dayjs');
import customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(customParseFormat);

export function isValidTimeFormat(value: string): boolean {
  return dayjs(value, 'HH:mm', true).isValid();
}

export function parseIntegerScore(value: string): number | null {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
    return null;
  }

  return parsed;
}

export function parseSleepHours(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
    return null;
  }

  return parsed;
}
