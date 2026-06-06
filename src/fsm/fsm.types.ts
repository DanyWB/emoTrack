import type { EventType } from '@prisma/client';

import type { EventRepeatMode } from '../events/events.constants';

export const FSM_STATES = {
  idle: 'idle',
  onboarding_consent: 'onboarding_consent',
  onboarding_reminder_time: 'onboarding_reminder_time',
  onboarding_first_checkin: 'onboarding_first_checkin',
  checkin_v2_onboarding: 'checkin_v2_onboarding',
  checkin_mood: 'checkin_mood',
  checkin_energy: 'checkin_energy',
  checkin_stress: 'checkin_stress',
  checkin_metric_score: 'checkin_metric_score',
  checkin_metric_tags: 'checkin_metric_tags',
  checkin_sleep_hours: 'checkin_sleep_hours',
  checkin_sleep_quality: 'checkin_sleep_quality',
  checkin_review: 'checkin_review',
  checkin_review_edit: 'checkin_review_edit',
  checkin_note_prompt: 'checkin_note_prompt',
  checkin_note: 'checkin_note',
  checkin_tags_prompt: 'checkin_tags_prompt',
  checkin_tags: 'checkin_tags',
  checkin_add_event_confirm: 'checkin_add_event_confirm',
  event_type: 'event_type',
  event_title: 'event_title',
  event_score: 'event_score',
  event_description: 'event_description',
  event_end_date: 'event_end_date',
  event_repeat_mode: 'event_repeat_mode',
  event_repeat_count: 'event_repeat_count',
  feedback_type: 'feedback_type',
  feedback_message: 'feedback_message',
  announcement_type: 'announcement_type',
  announcement_title: 'announcement_title',
  announcement_body: 'announcement_body',
  announcement_poll_options: 'announcement_poll_options',
  announcement_image: 'announcement_image',
  announcement_preview: 'announcement_preview',
  settings_menu: 'settings_menu',
  stats_period_select: 'stats_period_select',
  stats_metric_select: 'stats_metric_select',
} as const;

export type FsmState = (typeof FSM_STATES)[keyof typeof FSM_STATES];
export type FsmPayload = Record<string, unknown>;

export type EventFlowSource = 'standalone' | 'checkin';

export interface CheckinDraftPayload extends FsmPayload {
  moodScore?: number;
  energyScore?: number;
  stressScore?: number;
  metricScores?: Record<string, number>;
  metricKeys?: string[];
  metricTags?: Record<string, string[]>;
  extraMetricKeys?: string[];
  activeMetricKey?: string;
  selectedTagKeys?: string[];
  editingMetricKey?: string;
  editingSleepField?: 'hours' | 'quality';
  sleepHours?: number;
  sleepQuality?: number;
  entryId?: string;
  isUpdate?: boolean;
  noteText?: string;
  selectedTagIds?: string[];
  confirmedTagIds?: string[];
  eventAdded?: boolean;
  eventFlowSource?: EventFlowSource;
  eventType?: EventType;
  eventTitle?: string;
  eventScore?: number;
  eventDescription?: string;
  entryDateKey?: string;
  eventStartDateKey?: string;
  eventEndDateKey?: string;
  eventRepeatMode?: EventRepeatMode;
  eventRepeatCount?: number;
  eventSeriesId?: string;
  checkinTarget?: 'today' | 'yesterday';
  feedbackType?: string;
  announcementCampaignId?: string;
  announcementType?: string;
  announcementPageOffset?: number;
  checkinV2OnboardingStep?: number;
  settingsAwaiting?: 'reminder_time' | 'sleep_mode';
  settingsView?: 'main' | 'daily_metrics';
  statsPeriodType?: 'd7' | 'd30' | 'all';
  statsView?: 'metrics' | 'summary';
  statsSelectedMetricKey?: string;
  statsChartMessageIds?: number[];
  telegramPromptMessageId?: number | null;
  showMenuAfterSave?: boolean;
}
