import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { formatErrorLogEvent, formatLogEvent } from '../common/utils/logging.utils';
import { UsersService } from '../users/users.service';
import { RemindersService } from './reminders.service';

export interface ReminderJobsReconcileResult {
  eligibleCount: number;
  attemptedCount: number;
  failedCount: number;
  skipped: boolean;
}

@Injectable()
export class RemindersScheduler implements OnModuleInit {
  private readonly logger = new Logger(RemindersScheduler.name);

  constructor(
    private readonly remindersService: RemindersService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reconcileReminderJobs();
  }

  async reconcileReminderJobs(): Promise<ReminderJobsReconcileResult> {
    if (!this.remindersService.isBackgroundDeliveryAvailable()) {
      this.logger.debug(formatLogEvent('reminder_jobs_reconcile_skipped', {
        reason: 'background_delivery_unavailable',
      }));

      return {
        eligibleCount: 0,
        attemptedCount: 0,
        failedCount: 0,
        skipped: true,
      };
    }

    const users = await this.usersService.findUsersWithActiveReminders();
    let attemptedCount = 0;
    let failedCount = 0;

    for (const user of users) {
      attemptedCount += 1;

      try {
        await this.remindersService.scheduleDailyReminder(user.id);
      } catch (error) {
        failedCount += 1;
        this.logger.warn(formatErrorLogEvent('reminder_job_reconcile_failed', error, {
          userId: user.id,
        }));
      }
    }

    const logFields = {
      eligibleCount: users.length,
      attemptedCount,
      failedCount,
    };

    if (failedCount > 0) {
      this.logger.warn(formatLogEvent('reminder_jobs_reconciled', logFields));
    } else {
      this.logger.log(formatLogEvent('reminder_jobs_reconciled', logFields));
    }

    return {
      ...logFields,
      skipped: false,
    };
  }
}
