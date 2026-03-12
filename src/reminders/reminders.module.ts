import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { parseBooleanEnv } from '../config/config.utils';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CheckinsModule } from '../checkins/checkins.module';
import { SummariesModule } from '../summaries/summaries.module';
import { UsersModule } from '../users/users.module';

import { APP_QUEUES } from '../common/constants/app.constants';
import { RemindersProcessor } from './reminders.processor';
import { RemindersScheduler } from './reminders.scheduler';
import { RemindersService } from './reminders.service';

const jobsEnabled = parseBooleanEnv(process.env.JOBS_ENABLED, false);

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    CheckinsModule,
    SummariesModule,
    AnalyticsModule,
    ...(jobsEnabled
      ? [
          BullModule.registerQueue({
            name: APP_QUEUES.reminders,
          }),
        ]
      : []),
  ],
  providers: jobsEnabled
    ? [RemindersService, RemindersProcessor, RemindersScheduler]
    : [RemindersService, RemindersScheduler],
  exports: [RemindersService],
})
export class RemindersModule {}
