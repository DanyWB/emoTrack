import { Injectable } from '@nestjs/common';
import type { DailyMetricDefinition, Prisma, UserTrackedMetric } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

export interface UpsertUserTrackedMetricInput {
  metricDefinitionId: string;
  isEnabled: boolean;
  sortOrder: number;
}

export type UserTrackedMetricWithDefinition = Prisma.UserTrackedMetricGetPayload<{
  include: {
    metricDefinition: true;
  };
}>;

@Injectable()
export class DailyMetricsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveDefinitions(): Promise<DailyMetricDefinition[]> {
    return this.prisma.dailyMetricDefinition.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
  }

  findDefinitionsByKeys(keys: string[]): Promise<DailyMetricDefinition[]> {
    return this.prisma.dailyMetricDefinition.findMany({
      where: {
        key: {
          in: keys,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
  }

  findDefinitionsByIds(ids: string[]): Promise<DailyMetricDefinition[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.dailyMetricDefinition.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
  }

  findUserTrackedMetrics(userId: string): Promise<UserTrackedMetricWithDefinition[]> {
    return this.prisma.userTrackedMetric.findMany({
      where: { userId },
      include: {
        metricDefinition: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async upsertUserTrackedMetrics(
    userId: string,
    metrics: UpsertUserTrackedMetricInput[],
  ): Promise<UserTrackedMetric[]> {
    return this.prisma.$transaction(
      metrics.map((metric) =>
        this.prisma.userTrackedMetric.upsert({
          where: {
            userId_metricDefinitionId: {
              userId,
              metricDefinitionId: metric.metricDefinitionId,
            },
          },
          create: {
            userId,
            metricDefinitionId: metric.metricDefinitionId,
            isEnabled: metric.isEnabled,
            sortOrder: metric.sortOrder,
          },
          update: {
            isEnabled: metric.isEnabled,
            sortOrder: metric.sortOrder,
          },
        }),
      ),
    );
  }
}
