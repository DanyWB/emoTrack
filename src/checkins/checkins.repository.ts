import { Injectable } from '@nestjs/common';
import type { DailyEntry, DailyEntryMetricValue, DailyEntryTag, Prisma } from '@prisma/client';

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

export type EntryMetricValueRecord = DailyEntryMetricValue;
export interface AggregatedMetricAverageRecord {
  metricDefinitionId: string;
  average: number;
  observationsCount: number;
}

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

  findByIdAndUser(userId: string, entryId: string): Promise<DailyEntry | null> {
    return this.prisma.dailyEntry.findFirst({
      where: {
        id: entryId,
        userId,
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

  findRecentByUser(
    userId: string,
    limit: number,
    beforeEntryDate?: Date,
  ): Promise<RecentDailyEntryWithCounts[]> {
    return this.prisma.dailyEntry.findMany({
      where: {
        userId,
        ...(beforeEntryDate
          ? {
              entryDate: {
                lt: beforeEntryDate,
              },
            }
          : {}),
      },
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

  findByUserAndDateRange(userId: string, from: Date, to: Date): Promise<DailyEntry[]> {
    return this.prisma.dailyEntry.findMany({
      where: {
        userId,
        entryDate: {
          gte: from,
          lte: to,
        },
      },
      orderBy: [{ entryDate: 'asc' }],
    });
  }

  findMetricValuesByEntryIds(entryIds: string[]): Promise<EntryMetricValueRecord[]> {
    if (entryIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.dailyEntryMetricValue.findMany({
      where: {
        dailyEntryId: {
          in: entryIds,
        },
      },
      orderBy: [{ metricDefinitionId: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async aggregateMetricAveragesByUserAndDateRange(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<AggregatedMetricAverageRecord[]> {
    const rows = await this.prisma.dailyEntryMetricValue.groupBy({
      by: ['metricDefinitionId'],
      where: {
        dailyEntry: {
          is: {
            userId,
            entryDate: {
              gte: from,
              lte: to,
            },
          },
        },
      },
      _avg: {
        value: true,
      },
      _count: {
        value: true,
      },
    });

    return rows
      .filter((row): row is typeof row & { _avg: { value: number } } => typeof row._avg.value === 'number')
      .map((row) => ({
        metricDefinitionId: row.metricDefinitionId,
        average: row._avg.value,
        observationsCount: row._count.value,
      }));
  }

  async findTagIdsByEntryId(entryId: string): Promise<string[]> {
    const rows = await this.prisma.dailyEntryTag.findMany({
      where: {
        dailyEntryId: entryId,
      },
      orderBy: [{ tag: { sortOrder: 'asc' } }, { tag: { label: 'asc' } }],
      select: {
        tagId: true,
      },
    });

    return rows.map((row) => row.tagId);
  }

  upsertMetricValues(
    dailyEntryId: string,
    values: Array<{ metricDefinitionId: string; value: number }>,
  ) {
    if (values.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.$transaction(
      values.map((metricValue) =>
        this.prisma.dailyEntryMetricValue.upsert({
          where: {
            dailyEntryId_metricDefinitionId: {
              dailyEntryId,
              metricDefinitionId: metricValue.metricDefinitionId,
            },
          },
          create: {
            dailyEntryId,
            metricDefinitionId: metricValue.metricDefinitionId,
            value: metricValue.value,
          },
          update: {
            value: metricValue.value,
          },
        }),
      ),
    );
  }
}
