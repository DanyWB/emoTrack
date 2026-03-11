import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { FsmModule } from '../fsm/fsm.module';
import { RemindersModule } from '../reminders/reminders.module';
import { UsersModule } from '../users/users.module';

import { OnboardingFlow } from './onboarding.flow';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [UsersModule, FsmModule, AnalyticsModule, RemindersModule],
  providers: [OnboardingService, OnboardingFlow],
  exports: [OnboardingService, OnboardingFlow],
})
export class OnboardingModule {}
