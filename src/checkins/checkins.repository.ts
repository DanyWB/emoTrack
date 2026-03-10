import { Injectable } from '@nestjs/common';
import type { DailyEntry, DailyEntryTag, Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

type RecentDailyEntryWithCounts = Prisma.DailyEntryGetPayload<{
  include: {
    _count: {
      select: {
        events: true;
      };
    };
  };
}>;

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

  updateNote(entryId: string, noteText: string): Promise<DailyEntry> {
    return this.prisma.dailyEntry.update({
      where: { id: entryId },
      data: { noteText },
    });
  }

  async replaceTags(entryId: string, tagIds: string[]): Promise<DailyEntryTag[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.dailyEntryTag.deleteMany({
        where: { dailyEntryId: entryId },
      });

      if (tagIds.length === 0) {
        return [];
      }

      await tx.dailyEntryTag.createMany({
        data: tagIds.map((tagId) => ({
          dailyEntryId: entryId,
          tagId,
        })),
        skipDuplicates: true,
      });

      return tx.dailyEntryTag.findMany({
        where: { dailyEntryId: entryId },
      });
    });
  }

  findRecentByUser(userId: string, limit: number): Promise<RecentDailyEntryWithCounts[]> {
    return this.prisma.dailyEntry.findMany({
      where: { userId },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        _count: {
          select: {
            events: true,
          },
        },
      },
    });
  }
}
