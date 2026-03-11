import {
  isValidTimeFormat,
  parseIntegerScore,
  parseSleepHours,
} from '../../src/common/utils/validation.utils';

describe('validation utils', () => {
  it('validates strict HH:mm reminder time format', () => {
    expect(isValidTimeFormat('09:30')).toBe(true);
    expect(isValidTimeFormat('23:59')).toBe(true);
    expect(isValidTimeFormat('24:00')).toBe(false);
    expect(isValidTimeFormat('9:30')).toBe(false);
    expect(isValidTimeFormat('09-30')).toBe(false);
  });

  it('parses only integer scores from 0 to 10', () => {
    expect(parseIntegerScore('0')).toBe(0);
    expect(parseIntegerScore('10')).toBe(10);
    expect(parseIntegerScore('4.5')).toBeNull();
    expect(parseIntegerScore('-1')).toBeNull();
    expect(parseIntegerScore('11')).toBeNull();
  });

  it('parses sleep hours with decimals in the 0..24 range', () => {
    expect(parseSleepHours('7')).toBe(7);
    expect(parseSleepHours('7.5')).toBe(7.5);
    expect(parseSleepHours('24')).toBe(24);
    expect(parseSleepHours('24.1')).toBeNull();
    expect(parseSleepHours('seven')).toBeNull();
    expect(parseSleepHours('7.555')).toBeNull();
  });
});
