import '../config/bootstrap-env';

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { APP_QUEUES } from '../common/constants/app.constants';
import { parseBooleanEnv } from '../config/config.utils';
import { PrismaModule } from '../database/prisma.module';
import { AnnouncementsProcessor } from './announcements.processor';
import { AnnouncementsRepository } from './announcements.repository';
import { AnnouncementsService } from './announcements.service';

const jobsEnabled = parseBooleanEnv(process.env.JOBS_ENABLED, false);

@Module({
  imports: [
    PrismaModule,
    ...(jobsEnabled
      ? [
          BullModule.registerQueue({
            name: APP_QUEUES.announcements,
          }),
        ]
      : []),
  ],
  providers: jobsEnabled
    ? [AnnouncementsRepository, AnnouncementsService, AnnouncementsProcessor]
    : [AnnouncementsRepository, AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
