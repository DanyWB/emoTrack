import { Injectable } from '@nestjs/common';
import { SleepMode, type User } from '@prisma/client';

import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UsersRepository } from './users.repository';

export interface TelegramProfile {
  telegramId: bigint;
  username?: string;
  firstName?: string;
  languageCode?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findByTelegramId(telegramId: bigint): Promise<User | null> {
    return this.usersRepository.findByTelegramId(telegramId);
  }

  createFromTelegramProfile(profile: TelegramProfile): Promise<User> {
    return this.usersRepository.create({
      telegramId: profile.telegramId,
      username: profile.username,
      firstName: profile.firstName,
      languageCode: profile.languageCode ?? 'ru',
    });
  }

  async getOrCreateTelegramUser(profile: TelegramProfile): Promise<User> {
    const existing = await this.findByTelegramId(profile.telegramId);

    if (existing) {
      return this.usersRepository.updateTelegramProfile(existing.id, {
        username: profile.username,
        firstName: profile.firstName,
        languageCode: profile.languageCode,
      });
    }

    return this.createFromTelegramProfile(profile);
  }

  updateSettings(userId: string, dto: UpdateUserSettingsDto): Promise<User> {
    return this.usersRepository.updateSettings(userId, dto);
  }

  setReminderTime(userId: string, time: string): Promise<User> {
    return this.usersRepository.setReminderTime(userId, time);
  }

  setConsentGiven(userId: string, consentGiven: boolean): Promise<User> {
    return this.usersRepository.setConsentGiven(userId, consentGiven);
  }

  setSleepMode(userId: string, mode: SleepMode): Promise<User> {
    return this.usersRepository.setSleepMode(userId, mode);
  }

  completeOnboarding(userId: string): Promise<User> {
    return this.usersRepository.completeOnboarding(userId);
  }
}
