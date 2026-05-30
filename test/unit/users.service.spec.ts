import { SleepMode, type User } from '@prisma/client';

import { UsersService } from '../../src/users/users.service';

function buildUser(overrides: Partial<User> = {}): User {
  const now = new Date('2026-03-12T10:00:00.000Z');

  return {
    id: overrides.id ?? 'user-1',
    telegramId: overrides.telegramId ?? BigInt(1001),
    username: overrides.username ?? 'tester',
    firstName: overrides.firstName ?? 'Test',
    languageCode: overrides.languageCode ?? 'ru',
    timezone: overrides.timezone ?? 'Europe/Berlin',
    onboardingCompleted: overrides.onboardingCompleted ?? true,
    consentGiven: overrides.consentGiven ?? true,
    remindersEnabled: overrides.remindersEnabled ?? true,
    reminderTime: overrides.reminderTime ?? '21:30',
    sleepMode: overrides.sleepMode ?? SleepMode.both,
    checkinV2OnboardingCompleted: overrides.checkinV2OnboardingCompleted ?? true,
    trackMood: overrides.trackMood ?? true,
    trackEnergy: overrides.trackEnergy ?? true,
    trackStress: overrides.trackStress ?? true,
    trackSleep: overrides.trackSleep ?? true,
    notesEnabled: overrides.notesEnabled ?? true,
    tagsEnabled: overrides.tagsEnabled ?? true,
    eventsEnabled: overrides.eventsEnabled ?? true,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

describe('UsersService', () => {
  function createConfigService(defaultTimezone = 'Europe/Berlin') {
    return {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'app.defaultTimezone': defaultTimezone,
        };

        return values[key];
      }),
    };
  }

  it('keeps core check-in metrics enabled when settings updates try to disable legacy flags', async () => {
    const currentUser = buildUser();
    const updatedUser = buildUser({
      trackMood: true,
      trackEnergy: true,
      trackStress: true,
      trackSleep: false,
    });
    const repository = {
      findById: jest.fn().mockResolvedValue(currentUser),
      updateSettings: jest.fn().mockResolvedValue(updatedUser),
    };
    const dailyMetricsService = {
      ensureUserTrackedMetrics: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UsersService(repository as never, dailyMetricsService as never, createConfigService() as never);

    const result = await service.updateSettings(currentUser.id, {
      trackMood: false,
      trackEnergy: false,
      trackStress: false,
      trackSleep: false,
    });

    expect(repository.updateSettings).toHaveBeenCalledWith(currentUser.id, {
      trackMood: true,
      trackEnergy: true,
      trackStress: true,
      trackSleep: false,
    });
    expect(result.trackMood).toBe(true);
    expect(result.trackEnergy).toBe(true);
    expect(result.trackStress).toBe(true);
    expect(result.trackSleep).toBe(false);
    expect(dailyMetricsService.ensureUserTrackedMetrics).toHaveBeenCalledWith(updatedUser);
  });

  it('allows disabling the separate sleep block without disabling core metrics', async () => {
    const currentUser = buildUser();
    const updatedUser = buildUser({
      trackMood: true,
      trackEnergy: true,
      trackStress: true,
      trackSleep: false,
    });
    const repository = {
      findById: jest.fn().mockResolvedValue(currentUser),
      updateSettings: jest.fn().mockResolvedValue(updatedUser),
    };
    const dailyMetricsService = {
      ensureUserTrackedMetrics: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UsersService(repository as never, dailyMetricsService as never, createConfigService() as never);

    const result = await service.updateSettings(currentUser.id, {
      trackEnergy: false,
      trackStress: false,
      trackSleep: false,
    });

    expect(repository.updateSettings).toHaveBeenCalledWith(currentUser.id, {
      trackMood: true,
      trackEnergy: true,
      trackStress: true,
      trackSleep: false,
    });
    expect(result.trackMood).toBe(true);
    expect(result.trackEnergy).toBe(true);
    expect(result.trackStress).toBe(true);
    expect(result.trackSleep).toBe(false);
    expect(dailyMetricsService.ensureUserTrackedMetrics).toHaveBeenCalledWith(updatedUser);
  });

  it('creates Telegram users with the configured default timezone', async () => {
    const createdUser = buildUser({
      timezone: 'Europe/Moscow',
    });
    const repository = {
      create: jest.fn().mockResolvedValue(createdUser),
    };
    const dailyMetricsService = {
      ensureUserTrackedMetrics: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UsersService(
      repository as never,
      dailyMetricsService as never,
      createConfigService('Europe/Moscow') as never,
    );

    const result = await service.createFromTelegramProfile({
      telegramId: BigInt(1001),
      username: 'tester',
      firstName: 'Test',
      languageCode: 'ru',
    });

    expect(repository.create).toHaveBeenCalledWith({
      telegramId: BigInt(1001),
      username: 'tester',
      firstName: 'Test',
      languageCode: 'ru',
      timezone: 'Europe/Moscow',
    });
    expect(dailyMetricsService.ensureUserTrackedMetrics).toHaveBeenCalledWith(createdUser);
    expect(result.timezone).toBe('Europe/Moscow');
  });
});
