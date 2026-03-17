import { Injectable } from '@nestjs/common';
import { SleepMode, type User } from '@prisma/client';

import {
  hasAtLeastOneTrackedDailyMetric,
  type DailyTrackingSelection,
} from '../common/utils/validation.utils';
import { DailyMetricsService } from '../daily-metrics/daily-metrics.service';
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
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly dailyMetricsService: DailyMetricsService,
  ) {}

  findByTelegramId(telegramId: bigint): Promise<User | null> {
    return this.usersRepository.findByTelegramId(telegramId);
  }

  findById(userId: string): Promise<User | null> {
    return this.usersRepository.findById(userId);
  }

  async createFromTelegramProfile(profile: TelegramProfile): Promise<User> {
    const user = await this.usersRepository.create({
      telegramId: profile.telegramId,
      username: profile.username,
      firstName: profile.firstName,
      languageCode: profile.languageCode ?? 'ru',
    });

    await this.dailyMetricsService.ensureUserTrackedMetrics(user);
    return user;
  }

  async getOrCreateTelegramUser(profile: TelegramProfile): Promise<User> {
    const existing = await this.findByTelegramId(profile.telegramId);

    if (existing) {
      const updated = await this.usersRepository.updateTelegramProfile(existing.id, {
        username: profile.username,
        firstName: profile.firstName,
        languageCode: profile.languageCode,
      });
      await this.dailyMetricsService.ensureUserTrackedMetrics(updated);
      return updated;
    }

    return this.createFromTelegramProfile(profile);
  }

  async updateSettings(userId: string, dto: UpdateUserSettingsDto): Promise<User> {
    const user = await this.findById(userId);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const trackingSelection: DailyTrackingSelection = {
      trackMood: dto.trackMood ?? user.trackMood,
      trackEnergy: dto.trackEnergy ?? user.trackEnergy,
      trackStress: dto.trackStress ?? user.trackStress,
      trackSleep: dto.trackSleep ?? user.trackSleep,
    };

    if (!hasAtLeastOneTrackedDailyMetric(trackingSelection)) {
      throw new Error('INVALID_DAILY_TRACKING_CONFIGURATION');
    }

    const updatedUser = await this.usersRepository.updateSettings(userId, dto);
    await this.dailyMetricsService.ensureUserTrackedMetrics(updatedUser);
    return updatedUser;
  }

  setReminderTime(userId: string, time: string): Promise<User> {
    return this.usersRepository.setReminderTime(userId, time);
  }

  setRemindersEnabled(userId: string, remindersEnabled: boolean): Promise<User> {
    return this.usersRepository.update(userId, { remindersEnabled });
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
