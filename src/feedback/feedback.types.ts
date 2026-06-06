import type { FeedbackStatus, FeedbackType } from '@prisma/client';

export const FEEDBACK_TYPE_KEYS = ['bug', 'idea', 'question', 'review', 'other'] as const;

export type FeedbackTypeKey = (typeof FEEDBACK_TYPE_KEYS)[number];

export interface FeedbackTypeDefinition {
  key: FeedbackTypeKey;
  label: string;
  description: string;
}

export const FEEDBACK_TYPES: FeedbackTypeDefinition[] = [
  {
    key: 'bug',
    label: 'Ошибка',
    description: 'Что-то сломалось или работает не так.',
  },
  {
    key: 'idea',
    label: 'Идея',
    description: 'Предложение, как улучшить сервис.',
  },
  {
    key: 'question',
    label: 'Вопрос',
    description: 'Нужно уточнить работу бота или данных.',
  },
  {
    key: 'review',
    label: 'Отзыв',
    description: 'Общее впечатление о сервисе.',
  },
  {
    key: 'other',
    label: 'Другое',
    description: 'Все, что не подходит под остальные типы.',
  },
];

export const FEEDBACK_TYPE_BY_KEY = new Map(FEEDBACK_TYPES.map((item) => [item.key, item] as const));

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  unread: 'новое',
  reviewed: 'просмотрено',
  closed: 'закрыто',
};

export function isFeedbackTypeKey(value: string): value is FeedbackTypeKey {
  return FEEDBACK_TYPE_KEYS.includes(value as FeedbackTypeKey);
}

export function toPrismaFeedbackType(type: FeedbackTypeKey): FeedbackType {
  return type as FeedbackType;
}
