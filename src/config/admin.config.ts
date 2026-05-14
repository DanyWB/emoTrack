import { registerAs } from '@nestjs/config';

export interface AdminConfig {
  telegramIds: bigint[];
}

export function parseAdminTelegramIds(rawValue: string | undefined): bigint[] {
  if (!rawValue?.trim()) {
    return [];
  }

  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .map((value) => BigInt(value));
}

export default registerAs(
  'admin',
  (): AdminConfig => ({
    telegramIds: parseAdminTelegramIds(process.env.ADMIN_TELEGRAM_IDS),
  }),
);
