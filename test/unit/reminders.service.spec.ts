import { Logger } from '@nestjs/common';

import { RemindersService } from '../../src/reminders/reminders.service';
import { buildUser } from '../helpers/in-memory';

function createConfigService() {
  return {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        'app.jobsEnabled': true,
        'telegram.botToken': 'replace_with_real_token',
      };

      return values[key];
    }),
  };
}

function createQueue() {
  return {
    add: jest.fn().mockResolvedValue(undefined),
    getRepeatableJobs: jest.fn().mockResolvedValue([
      { id: 'daily-reminder:user-1', key: 'daily-key' },
      { id: 'weekly-summary:repeat:user-1', key: 'weekly-key' },
      { id: 'daily-reminder:other-user', key: 'other-key' },
    ]),
    removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
  };
}

describe('RemindersService', () => {
  it('removes stale repeatable jobs when reminder time is invalid', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const queue = createQueue();
    const usersService = {
      findById: jest.fn().mockResolvedValue(buildUser({
        id: 'user-1',
        reminderTime: '24:00',
        remindersEnabled: true,
        onboardingCompleted: true,
      })),
    };
    const service = new RemindersService(
      createConfigService() as never,
      usersService as never,
      {} as never,
      {} as never,
      {} as never,
      queue as never,
    );

    try {
      await service.scheduleDailyReminder('user-1');

      expect(queue.add).not.toHaveBeenCalled();
      expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('daily-key');
      expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('weekly-key');
      expect(queue.removeRepeatableByKey).not.toHaveBeenCalledWith('other-key');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('event=invalid_reminder_time_skipped'));
    } finally {
      warnSpy.mockRestore();
    }
  });
});
