import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AdminConfig } from '../config/admin.config';
import { AdminRepository } from './admin.repository';
import type { AdminActiveUsersPage, AdminOverview, AdminUserDetail } from './admin.types';

@Injectable()
export class AdminService {
  private readonly adminTelegramIds: Set<string>;

  constructor(
    private readonly adminRepository: AdminRepository,
    configService: ConfigService,
  ) {
    const config = configService.get<AdminConfig>('admin', { infer: true });
    const telegramIds: bigint[] = config?.telegramIds ?? [];
    this.adminTelegramIds = new Set(telegramIds.map((telegramId) => telegramId.toString()));
  }

  isAdminTelegramId(telegramId: number | bigint | string | undefined | null): boolean {
    const normalized = this.normalizeTelegramId(telegramId);
    return normalized !== null && this.adminTelegramIds.has(normalized);
  }

  getOverview(): Promise<AdminOverview> {
    return this.adminRepository.getOverview();
  }

  listActiveUsers(options: { offset: number; limit: number }): Promise<AdminActiveUsersPage> {
    return this.adminRepository.listActiveUsers(options);
  }

  getUserDetail(userId: string): Promise<AdminUserDetail | null> {
    return this.adminRepository.getUserDetail(userId);
  }

  findEntryOwnerUserId(entryId: string): Promise<string | null> {
    return this.adminRepository.findEntryOwnerUserId(entryId);
  }

  private normalizeTelegramId(telegramId: number | bigint | string | undefined | null): string | null {
    if (typeof telegramId === 'bigint') {
      return telegramId.toString();
    }

    if (typeof telegramId === 'number' && Number.isInteger(telegramId) && telegramId > 0) {
      return String(telegramId);
    }

    if (typeof telegramId === 'string' && /^\d+$/.test(telegramId.trim())) {
      return telegramId.trim();
    }

    return null;
  }
}
