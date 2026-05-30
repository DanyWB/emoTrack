import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SleepMode, type User } from '@prisma/client';

import {
  DailyMetricsService,
  type TrackedMetricSettingsItem,
  type EnabledCheckinMetric,
} from '../daily-metrics/daily-metrics.service';
import { type DailyMetricCatalogKey } from '../daily-metrics/daily-metrics.catalog';
import {
  CHECKIN_V2_MAX_OPTIONAL_METRICS,
  isCheckinV2CoreMetricKey,
  isCheckinV2OptionalMetricKey,
} from '../checkins/checkins-v2.catalog';
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
    private readonly configService: ConfigService,
  ) {}

  findByTelegramId(telegramId: bigint): Promise<User | null> {
    return this.usersRepository.findByTelegramId(telegramId);
  }

  findById(userId: string): Promise<User | null> {
    return this.usersRepository.findById(userId);
  }

  findUsersWithActiveReminders(): Promise<User[]> {
    return this.usersRepository.findUsersWithActiveReminders();
  }

  async createFromTelegramProfile(profile: TelegramProfile): Promise<User> {
    const user = await this.usersRepository.create({
      telegramId: profile.telegramId,
      username: profile.username,
      firstName: profile.firstName,
      languageCode: profile.languageCode ?? 'ru',
      timezone: this.configService.get<string>('app.defaultTimezone', { infer: true }) ?? 'Europe/Berlin',
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

    const updatedUser = await this.usersRepository.updateSettings(userId, {
      ...dto,
      trackMood: true,
      trackEnergy: true,
      trackStress: true,
    });
    await this.dailyMetricsService.ensureUserTrackedMetrics(updatedUser);
    return updatedUser;
  }

  async getTrackedMetrics(userId: string): Promise<TrackedMetricSettingsItem[]> {
    const user = await this.findById(userId);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    return this.dailyMetricsService.getUserTrackedMetricsForSettings(user);
  }

  async getEnabledCheckinMetrics(userId: string): Promise<EnabledCheckinMetric[]> {
    const user = await this.findById(userId);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    return this.dailyMetricsService.getEnabledCheckinMetrics(user);
  }

  async setTrackedMetric(userId: string, metricKey: DailyMetricCatalogKey, enabled: boolean): Promise<User> {
    const user = await this.findById(userId);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (metricKey === 'sleep') {
      const updatedUser = await this.usersRepository.update(userId, {
        trackSleep: enabled,
      });
      await this.dailyMetricsService.ensureUserTrackedMetrics(updatedUser);
      return updatedUser;
    }

    if (isCheckinV2CoreMetricKey(metricKey)) {
      if (!enabled) {
        throw new Error('CORE_CHECKIN_METRIC_IMMUTABLE');
      }

      return user;
    }

    if (!isCheckinV2OptionalMetricKey(metricKey)) {
      throw new Error('UNKNOWN_CHECKIN_METRIC');
    }

    const metrics = await this.dailyMetricsService.getUserTrackedMetricsForSettings(user);
    const nextMetrics = metrics.map((metric) =>
      metric.key === metricKey
        ? {
            ...metric,
            enabled,
          }
        : metric,
    );

    const enabledOptionalCount = nextMetrics.filter(
      (metric) => isCheckinV2OptionalMetricKey(metric.key) && metric.enabled,
    ).length;

    if (enabledOptionalCount > CHECKIN_V2_MAX_OPTIONAL_METRICS) {
      throw new Error('TOO_MANY_OPTIONAL_CHECKIN_METRICS');
    }

    await this.dailyMetricsService.persistTrackedMetricSettings(
      userId,
      nextMetrics.map((metric) => ({
        key: metric.key,
        enabled: metric.enabled,
        sortOrder: metric.sortOrder,
      })),
    );

    return user;
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

  setCheckinV2OnboardingCompleted(userId: string, completed: boolean): Promise<User> {
    return this.usersRepository.setCheckinV2OnboardingCompleted(userId, completed);
  }

  setSleepMode(userId: string, mode: SleepMode): Promise<User> {
    return this.usersRepository.setSleepMode(userId, mode);
  }

  completeOnboarding(userId: string): Promise<User> {
    return this.usersRepository.completeOnboarding(userId);
  }
}
