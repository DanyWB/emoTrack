import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { FeedbackRepository } from './feedback.repository';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [AnalyticsModule],
  providers: [FeedbackRepository, FeedbackService],
  exports: [FeedbackRepository, FeedbackService],
})
export class FeedbackModule {}
