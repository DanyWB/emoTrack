export const EVENT_REPEAT_MODES = {
  none: 'none',
  daily: 'daily',
  weekly: 'weekly',
} as const;

export type EventRepeatMode = (typeof EVENT_REPEAT_MODES)[keyof typeof EVENT_REPEAT_MODES];

export const EVENT_REPEAT_MIN_OCCURRENCES = 2;
export const EVENT_REPEAT_MAX_OCCURRENCES = 7;
