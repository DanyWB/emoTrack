import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type {
  AdminActiveUserListItem,
  AdminActiveUsersPage,
  AdminOverview,
  AdminUserDetail,
} from './admin.types';

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(now = new Date()): Promise<AdminOverview> {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalUsers,
      consentedUsers,
      onboardedUsers,
      activeUserRows,
      totalCheckins,
      totalEvents,
      checkinsLast7Days,
      eventsLast7Days,
      remindersEnabledUsers,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { consentGiven: true } }),
      this.prisma.user.count({ where: { onboardingCompleted: true } }),
      this.prisma.dailyEntry.findMany({
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.dailyEntry.count(),
      this.prisma.event.count(),
      this.prisma.dailyEntry.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.event.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.user.count({ where: { remindersEnabled: true, reminderTime: { not: null } } }),
    ]);

    return {
      totalUsers,
      consentedUsers,
      onboardedUsers,
      activeUsers: activeUserRows.length,
      totalCheckins,
      totalEvents,
      checkinsLast7Days,
      eventsLast7Days,
      remindersEnabledUsers,
    };
  }

  async listActiveUsers(options: { offset: number; limit: number }): Promise<AdminActiveUsersPage> {
    const offset = Math.max(0, options.offset);
    const limit = Math.min(Math.max(1, options.limit), 20);
    const [totalRows, groupedRows] = await Promise.all([
      this.prisma.dailyEntry.findMany({
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.dailyEntry.groupBy({
        by: ['userId'],
        _count: { _all: true },
        _max: { entryDate: true },
        orderBy: { _max: { entryDate: 'desc' } },
        skip: offset,
        take: limit,
      }),
    ]);
    const userIds = groupedRows.map((row) => row.userId);

    if (userIds.length === 0) {
      return {
        items: [],
        total: totalRows.length,
        offset,
        limit,
        hasPrevious: offset > 0,
        hasNext: false,
      };
    }

    const [users, eventCounts] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
      }),
      this.prisma.event.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _count: { _all: true },
      }),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const eventsCountByUserId = new Map(eventCounts.map((row) => [row.userId, row._count._all]));
    const items: AdminActiveUserListItem[] = groupedRows
      .map((row) => {
        const user = usersById.get(row.userId);

        if (!user) {
          return null;
        }

        return {
          user,
          entriesCount: row._count._all,
          eventsCount: eventsCountByUserId.get(row.userId) ?? 0,
          lastEntryDate: row._max.entryDate,
        };
      })
      .filter((item): item is AdminActiveUserListItem => item !== null);

    return {
      items,
      total: totalRows.length,
      offset,
      limit,
      hasPrevious: offset > 0,
      hasNext: offset + limit < totalRows.length,
    };
  }

  async getUserDetail(userId: string): Promise<AdminUserDetail | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return null;
    }

    const [entryStats, eventsCount, summariesCount] = await Promise.all([
      this.prisma.dailyEntry.aggregate({
        where: { userId },
        _count: { _all: true },
        _min: { entryDate: true },
        _max: { entryDate: true },
      }),
      this.prisma.event.count({ where: { userId } }),
      this.prisma.summary.count({ where: { userId } }),
    ]);

    return {
      user,
      entriesCount: entryStats._count._all,
      eventsCount,
      lastEntryDate: entryStats._max.entryDate,
      firstEntryDate: entryStats._min.entryDate,
      summariesCount,
    };
  }

  async findEntryOwnerUserId(entryId: string): Promise<string | null> {
    const entry = await this.prisma.dailyEntry.findUnique({
      where: { id: entryId },
      select: { userId: true },
    });

    return entry?.userId ?? null;
  }
}
