import { Injectable } from '@nestjs/common';
import type { DailyEntry, Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CheckinsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserAndDate(userId: string, entryDate: Date): Promise<DailyEntry | null> {
    return this.prisma.dailyEntry.findUnique({
      where: {
        userId_entryDate: {
          userId,
          entryDate,
        },
      },
    });
  }

  upsertByUserAndDate(
    userId: string,
    entryDate: Date,
    data: Omit<Prisma.DailyEntryUncheckedCreateInput, 'id' | 'userId' | 'entryDate'>,
  ): Promise<DailyEntry> {
    return this.prisma.dailyEntry.upsert({
      where: {
        userId_entryDate: {
          userId,
          entryDate,
        },
      },
      create: {
        userId,
        entryDate,
        ...data,
      },
      update: {
        ...data,
      },
    });
  }
}
