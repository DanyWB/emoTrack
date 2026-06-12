import type {
  AnnouncementDeliveryStatus,
  AnnouncementStatus,
  AnnouncementType,
} from '@prisma/client';

export const ANNOUNCEMENT_TYPES = [
  { key: 'update', label: 'Обновление', icon: '📣' },
  { key: 'important', label: 'Важное', icon: '❗' },
  { key: 'maintenance', label: 'Техработы', icon: '🛠' },
  { key: 'poll', label: 'Опрос', icon: '🗳' },
  { key: 'other', label: 'Другое', icon: '📌' },
] as const satisfies ReadonlyArray<{
  key: AnnouncementType;
  label: string;
  icon: string;
}>;

export type AnnouncementTypeKey = (typeof ANNOUNCEMENT_TYPES)[number]['key'];

export const ANNOUNCEMENT_TYPE_BY_KEY = new Map<AnnouncementTypeKey, (typeof ANNOUNCEMENT_TYPES)[number]>(
  ANNOUNCEMENT_TYPES.map((type) => [type.key, type]),
);

export const ANNOUNCEMENT_STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: 'черновик',
  ready: 'готово к отправке',
  sending: 'отправляется',
  sent: 'отправлено',
  partially_failed: 'частично отправлено',
  failed: 'ошибка отправки',
  cancelled: 'отменено',
};

export const ANNOUNCEMENT_DELIVERY_STATUS_LABELS: Record<AnnouncementDeliveryStatus, string> = {
  pending: 'в очереди',
  sent: 'доставлено',
  failed: 'ошибка',
  blocked: 'бот заблокирован',
};

export interface AnnouncementDeliveryCounts {
  pending: number;
  sent: number;
  failed: number;
  blocked: number;
}

export const ANNOUNCEMENT_SENDING_RECOVERY_AFTER_MS = 10 * 60 * 1000;

export interface AnnouncementSendReport {
  campaignId: string;
  audienceCount: number;
  deliveryCounts: AnnouncementDeliveryCounts;
  queued: boolean;
  skippedReason?: 'no_audience';
}

export interface AnnouncementPollVoteResult {
  status: 'voted' | 'already_voted' | 'not_found' | 'not_allowed';
  optionLabel?: string;
}

export const ANNOUNCEMENT_JOB_NAMES = {
  sendDelivery: 'send-delivery',
  finalizeCampaign: 'finalize-campaign',
} as const;

export interface AnnouncementDeliveryJobData {
  deliveryId: string;
}

export interface AnnouncementFinalizeJobData {
  campaignId: string;
}

export function isAnnouncementTypeKey(value: string): value is AnnouncementTypeKey {
  return ANNOUNCEMENT_TYPE_BY_KEY.has(value as AnnouncementTypeKey);
}
