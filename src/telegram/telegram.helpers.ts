import type { Context } from 'telegraf';

export function normalizeTelegramText(text: string): string {
  return text.trim();
}

export interface TelegramUserProfile {
  telegramId: bigint;
  username?: string;
  firstName?: string;
  languageCode?: string;
}

export function extractTelegramProfile(ctx: Context): TelegramUserProfile | null {
  if (!ctx.from) {
    return null;
  }

  return {
    telegramId: BigInt(ctx.from.id),
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    languageCode: ctx.from.language_code,
  };
}

export function getCallbackData(ctx: Context): string | null {
  const callbackQuery = ctx.callbackQuery;

  if (!callbackQuery || !('data' in callbackQuery)) {
    return null;
  }

  return callbackQuery.data ?? null;
}
