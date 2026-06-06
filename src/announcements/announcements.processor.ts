import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { APP_QUEUES } from '../common/constants/app.constants';
import { ANNOUNCEMENT_JOB_NAMES } from './announcements.types';
import { AnnouncementsService } from './announcements.service';

@Processor(APP_QUEUES.announcements)
export class AnnouncementsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnnouncementsProcessor.name);

  constructor(private readonly announcementsService: AnnouncementsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.debug(`Received announcement job: ${job.name}`);

    if (job.name === ANNOUNCEMENT_JOB_NAMES.sendDelivery) {
      const deliveryId = (job.data as { deliveryId?: string }).deliveryId;

      if (deliveryId) {
        await this.announcementsService.processDeliveryJob(deliveryId, {
          finalAttempt: this.isFinalAttempt(job),
        });
      }

      return;
    }

    if (job.name === ANNOUNCEMENT_JOB_NAMES.finalizeCampaign) {
      const campaignId = (job.data as { campaignId?: string }).campaignId;

      if (campaignId) {
        await this.announcementsService.processFinalizeCampaignJob(campaignId);
      }
    }
  }

  private isFinalAttempt(job: Job): boolean {
    const attempts = typeof job.opts.attempts === 'number' && job.opts.attempts > 0 ? job.opts.attempts : 1;
    return job.attemptsMade + 1 >= attempts;
  }
}
