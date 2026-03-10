import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { APP_QUEUES } from '../common/constants/app.constants';

@Processor(APP_QUEUES.reminders)
export class RemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(RemindersProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.debug(`Received reminder job: ${job.name}`);
  }
}
