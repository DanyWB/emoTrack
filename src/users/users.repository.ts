import { Injectable } from '@nestjs/common';
import { SleepMode, type Prisma, type User } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTelegramId(telegramId: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { telegramId },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  updateSettings(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.update(id, data);
  }

  setReminderTime(id: string, reminderTime: string): Promise<User> {
    return this.update(id, { reminderTime });
  }

  setConsentGiven(id: string, consentGiven: boolean): Promise<User> {
    return this.update(id, { consentGiven });
  }

  updateTelegramProfile(
    id: string,
    profile: { username?: string; firstName?: string; languageCode?: string },
  ): Promise<User> {
    return this.update(id, {
      username: profile.username,
      firstName: profile.firstName,
      languageCode: profile.languageCode,
    });
  }

  setSleepMode(id: string, sleepMode: SleepMode): Promise<User> {
    return this.update(id, { sleepMode });
  }

  completeOnboarding(id: string): Promise<User> {
    return this.update(id, { onboardingCompleted: true });
  }
}
