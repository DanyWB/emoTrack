import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';

import { AnalyticsService } from '../analytics/analytics.service';
import { FsmService } from '../fsm/fsm.service';
import { FSM_STATES } from '../fsm/fsm.types';
import { isValidTimeFormat } from '../common/utils/validation.utils';
import { OnboardingService } from './onboarding.service';

export type OnboardingStepType =
  | 'already_ready'
  | 'ask_consent'
  | 'ask_reminder_time'
  | 'first_checkin_offer'
  | 'invalid_reminder_time';

export interface OnboardingStepResult {
  step: OnboardingStepType;
  includeIntro?: boolean;
}

@Injectable()
export class OnboardingFlow {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly fsmService: FsmService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async startOrResume(user: User, includeIntro = false): Promise<OnboardingStepResult> {
    if (!this.onboardingService.needsOnboarding(user)) {
      await this.fsmService.setIdle(user.id);
      return { step: 'already_ready' };
    }

    if (!user.consentGiven) {
      await this.fsmService.setState(user.id, FSM_STATES.onboarding_consent, {});
      return {
        step: 'ask_consent',
        includeIntro,
      };
    }

    if (!user.reminderTime) {
      await this.fsmService.setState(user.id, FSM_STATES.onboarding_reminder_time, {});
      return { step: 'ask_reminder_time' };
    }

    await this.onboardingService.completeOnboarding(user.id);
    await this.analyticsService.track('onboarding_completed', {}, user.id);
    await this.fsmService.setState(user.id, FSM_STATES.onboarding_first_checkin, {});

    return { step: 'first_checkin_offer' };
  }

  async acceptConsent(user: User): Promise<OnboardingStepResult> {
    if (!user.consentGiven) {
      await this.onboardingService.setConsentGiven(user.id);
      await this.analyticsService.track('consent_given', {}, user.id);
    }

    await this.fsmService.setState(user.id, FSM_STATES.onboarding_reminder_time, {});

    return { step: 'ask_reminder_time' };
  }

  async submitReminderTime(user: User, reminderTime: string): Promise<OnboardingStepResult> {
    if (!isValidTimeFormat(reminderTime)) {
      return { step: 'invalid_reminder_time' };
    }

    await this.onboardingService.setReminderTime(user.id, reminderTime);
    await this.analyticsService.track('reminder_time_set', { reminderTime }, user.id);

    if (!user.onboardingCompleted) {
      await this.onboardingService.completeOnboarding(user.id);
      await this.analyticsService.track('onboarding_completed', {}, user.id);
    }

    await this.fsmService.setState(user.id, FSM_STATES.onboarding_first_checkin, {});

    return { step: 'first_checkin_offer' };
  }

  async cancel(userId: string): Promise<void> {
    await this.fsmService.clearSession(userId);
  }

  async finishFirstCheckinOffer(userId: string): Promise<void> {
    await this.fsmService.setIdle(userId);
  }
}
