import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue, RepeatableJob } from 'bullmq';
import { Telegram } from 'telegraf';

import { APP_QUEUES } from '../common/constants/app.constants';
import { isValidTimeFormat } from '../common/utils/validation.utils';
import { CheckinsService } from '../checkins/checkins.service';
import { UsersService } from '../users/users.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { telegramCopy } from '../telegram/telegram.copy';

interface ReminderJobData {
  userId: string;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  private readonly jobsEnabled: boolean;
  private readonly telegramApi: Telegram;
  private readonly telegramEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly checkinsService: CheckinsService,
    private readonly analyticsService: AnalyticsService,
    @Optional() @InjectQueue(APP_QUEUES.reminders) private readonly remindersQueue?: Queue,
  ) {
    this.jobsEnabled = this.configService.get<boolean>('app.jobsEnabled', { infer: true }) ?? false;
    const botToken = this.configService.get<string>('telegram.botToken', { infer: true }) ?? '';
    this.telegramApi = new Telegram(botToken);
    this.telegramEnabled = !!botToken && !botToken.startsWith('replace_with_');
  }

  async scheduleDailyReminder(userId: string): Promise<void> {
    if (!this.jobsEnabled || !this.remindersQueue) {
      this.logger.debug(`Skipped scheduling reminder for user ${userId} because jobs are disabled.`);
      return;
    }

    const user = await this.usersService.findById(userId);

    if (!user || !user.onboardingCompleted || !user.remindersEnabled || !user.reminderTime) {
      return;
    }

    if (!isValidTimeFormat(user.reminderTime)) {
      this.logger.warn(`Skipping invalid reminder time for user ${userId}`);
      return;
    }

    await this.removeExistingDailyReminder(userId);

    const [hour, minute] = user.reminderTime.split(':').map((value) => Number(value));
    const pattern = `0 ${minute} ${hour} * * *`;

    await this.remindersQueue.add(
      'daily-reminder',
      { userId } satisfies ReminderJobData,
      {
        jobId: this.dailyJobId(userId),
        removeOnComplete: 50,
        removeOnFail: 50,
        repeat: {
          pattern,
          tz: user.timezone,
        },
      },
    );

    this.logger.log(`Scheduled daily reminder for user ${userId} at ${user.reminderTime} (${user.timezone})`);
  }

  async rescheduleDailyReminder(userId: string): Promise<void> {
    if (!this.jobsEnabled || !this.remindersQueue) {
      this.logger.debug(`Skipped rescheduling reminder for user ${userId} because jobs are disabled.`);
      return;
    }

    await this.removeExistingDailyReminder(userId);
    await this.scheduleDailyReminder(userId);
  }

  async cancelDailyReminder(userId: string): Promise<void> {
    if (!this.jobsEnabled || !this.remindersQueue) {
      this.logger.debug(`Skipped reminder cancel for user ${userId} because jobs are disabled.`);
      return;
    }

    await this.removeExistingDailyReminder(userId);
    this.logger.log(`Cancelled daily reminder for user ${userId}`);
  }

  async enqueueWeeklySummary(userId: string): Promise<void> {
    if (!this.jobsEnabled || !this.remindersQueue) {
      return;
    }

    await this.remindersQueue.add(
      'weekly-summary',
      { userId } satisfies ReminderJobData,
      {
        jobId: `weekly-summary:${userId}`,
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
  }

  async sendDailyReminder(userId: string): Promise<void> {
    if (!this.telegramEnabled) {
      return;
    }

    const user = await this.usersService.findById(userId);

    if (!user) {
      return;
    }

    const shouldSend = await this.shouldSendReminder(userId, new Date());

    if (!shouldSend) {
      return;
    }

    try {
      await this.telegramApi.sendMessage(String(user.telegramId), telegramCopy.reminders.dailyPrompt);
      await this.analyticsService.track('reminder_sent', {}, userId);
      this.logger.log(`Sent daily reminder to user ${userId}`);
    } catch (error) {
      this.logger.warn(`Failed to send reminder to user ${userId}: ${(error as Error).message}`);
    }
  }

  async shouldSendReminder(userId: string, date: Date): Promise<boolean> {
    const user = await this.usersService.findById(userId);

    if (!user || !user.onboardingCompleted || !user.remindersEnabled || !user.reminderTime) {
      return false;
    }

    const todayEntriesCount = await this.checkinsService.countTodayEntry(userId, {
      date,
      timezone: user.timezone,
    });

    return todayEntriesCount === 0;
  }

  private async removeExistingDailyReminder(userId: string): Promise<void> {
    if (!this.remindersQueue) {
      return;
    }

    const repeatableJobs = await this.remindersQueue.getRepeatableJobs();
    const targetJobId = this.dailyJobId(userId);

    const jobsToRemove = repeatableJobs.filter((job: RepeatableJob) => job.id === targetJobId);

    for (const job of jobsToRemove) {
      await this.remindersQueue.removeRepeatableByKey(job.key);
    }
  }

  private dailyJobId(userId: string): string {
    return `daily-reminder:${userId}`;
  }
}
