export const FSM_STATES = {
  idle: 'idle',
  onboarding_consent: 'onboarding_consent',
  onboarding_reminder_time: 'onboarding_reminder_time',
  onboarding_first_checkin: 'onboarding_first_checkin',
  checkin_mood: 'checkin_mood',
  checkin_energy: 'checkin_energy',
  checkin_stress: 'checkin_stress',
  checkin_sleep_hours: 'checkin_sleep_hours',
  checkin_sleep_quality: 'checkin_sleep_quality',
  checkin_note_prompt: 'checkin_note_prompt',
  checkin_note: 'checkin_note',
  checkin_tags_prompt: 'checkin_tags_prompt',
  checkin_tags: 'checkin_tags',
  checkin_add_event_confirm: 'checkin_add_event_confirm',
  event_type: 'event_type',
  event_title: 'event_title',
  event_score: 'event_score',
  event_description: 'event_description',
  settings_menu: 'settings_menu',
  stats_period_select: 'stats_period_select',
} as const;

export type FsmState = (typeof FSM_STATES)[keyof typeof FSM_STATES];
export type FsmPayload = Record<string, unknown>;

export interface CheckinDraftPayload extends FsmPayload {
  moodScore?: number;
  energyScore?: number;
  stressScore?: number;
  sleepHours?: number;
  sleepQuality?: number;
}
