import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { APP_QUEUES } from '../common/constants/app.constants';
import { RemindersService } from './reminders.service';

@Processor(APP_QUEUES.reminders)
export class RemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(RemindersProcessor.name);

  constructor(private readonly remindersService: RemindersService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.debug(`Received reminder job: ${job.name}`);

    if (job.name === 'daily-reminder') {
      const userId = (job.data as { userId?: string }).userId;

      if (userId) {
        await this.remindersService.sendDailyReminder(userId);
      }
    }
  }
}
