import { Logger } from '@nestjs/common';

import { RemindersScheduler } from '../../src/reminders/reminders.scheduler';

describe('RemindersScheduler', () => {
  it('skips reconciliation when background delivery is unavailable', async () => {
    const remindersService = {
      isBackgroundDeliveryAvailable: jest.fn().mockReturnValue(false),
      scheduleDailyReminder: jest.fn(),
    };
    const usersService = {
      findUsersWithActiveReminders: jest.fn(),
    };
    const scheduler = new RemindersScheduler(remindersService as never, usersService as never);

    await expect(scheduler.reconcileReminderJobs()).resolves.toEqual({
      eligibleCount: 0,
      attemptedCount: 0,
      failedCount: 0,
      skipped: true,
    });
    expect(usersService.findUsersWithActiveReminders).not.toHaveBeenCalled();
    expect(remindersService.scheduleDailyReminder).not.toHaveBeenCalled();
  });

  it('attempts every eligible user and logs failed reminder reconciliations', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const remindersService = {
      isBackgroundDeliveryAvailable: jest.fn().mockReturnValue(true),
      scheduleDailyReminder: jest.fn(async (userId: string) => {
        if (userId === 'user-2') {
          throw new Error('queue failure');
        }
      }),
    };
    const usersService = {
      findUsersWithActiveReminders: jest.fn().mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ]),
    };
    const scheduler = new RemindersScheduler(remindersService as never, usersService as never);

    await expect(scheduler.reconcileReminderJobs()).resolves.toEqual({
      eligibleCount: 3,
      attemptedCount: 3,
      failedCount: 1,
      skipped: false,
    });
    expect(remindersService.scheduleDailyReminder).toHaveBeenCalledTimes(3);
    expect(remindersService.scheduleDailyReminder).toHaveBeenNthCalledWith(1, 'user-1');
    expect(remindersService.scheduleDailyReminder).toHaveBeenNthCalledWith(2, 'user-2');
    expect(remindersService.scheduleDailyReminder).toHaveBeenNthCalledWith(3, 'user-3');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('event=reminder_job_reconcile_failed'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('event=reminder_jobs_reconciled'));

    warnSpy.mockRestore();
  });
});
