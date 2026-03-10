import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';

import { UsersService } from '../users/users.service';

@Injectable()
export class OnboardingService {
  constructor(private readonly usersService: UsersService) {}

  needsOnboarding(user: User): boolean {
    return !user.onboardingCompleted;
  }

  async setConsentGiven(userId: string): Promise<void> {
    await this.usersService.setConsentGiven(userId, true);
  }

  async setReminderTime(userId: string, reminderTime: string): Promise<void> {
    await this.usersService.setReminderTime(userId, reminderTime);
  }

  async completeOnboarding(userId: string): Promise<void> {
    await this.usersService.completeOnboarding(userId);
  }
}