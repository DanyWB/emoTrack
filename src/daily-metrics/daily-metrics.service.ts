import { Injectable, Logger } from '@nestjs/common';
import type { DailyMetricDefinition, User } from '@prisma/client';

import { type DailyTrackingSelection } from '../common/utils/validation.utils';
import { DAILY_METRIC_CATALOG, LEGACY_TRACKED_METRIC_MAP } from './daily-metrics.catalog';
import {
  DailyMetricsRepository,
  type UpsertUserTrackedMetricInput,
  type UserTrackedMetricWithDefinition,
} from './daily-metrics.repository';

type LegacyTrackingUser = Pick<
  User,
  'id' | 'trackMood' | 'trackEnergy' | 'trackStress' | 'trackSleep'
>;

@Injectable()
export class DailyMetricsService {
  private readonly logger = new Logger(DailyMetricsService.name);

  constructor(private readonly dailyMetricsRepository: DailyMetricsRepository) {}

  getActiveDefinitions(): Promise<DailyMetricDefinition[]> {
    return this.dailyMetricsRepository.findActiveDefinitions();
  }

  getUserTrackedMetrics(userId: string): Promise<UserTrackedMetricWithDefinition[]> {
    return this.dailyMetricsRepository.findUserTrackedMetrics(userId);
  }

  async ensureUserTrackedMetrics(user: LegacyTrackingUser): Promise<void> {
    const [definitions, existingMetrics] = await Promise.all([
      this.dailyMetricsRepository.findActiveDefinitions(),
      this.dailyMetricsRepository.findUserTrackedMetrics(user.id),
    ]);

    if (definitions.length === 0) {
      this.logger.warn(`Daily metric catalog is empty while syncing user ${user.id}.`);
      return;
    }

    const existingByDefinitionId = new Map(
      existingMetrics.map((metric) => [metric.metricDefinitionId, metric] as const),
    );

    const syncPayload: UpsertUserTrackedMetricInput[] = definitions.map((definition) => {
      const existing = existingByDefinitionId.get(definition.id);

      return {
        metricDefinitionId: definition.id,
        isEnabled: this.resolveEnabledState(definition, user, existing),
        sortOrder: existing?.sortOrder ?? definition.sortOrder,
      };
    });

    await this.dailyMetricsRepository.upsertUserTrackedMetrics(user.id, syncPayload);
  }

  getAvailableScoreMetricKeys(): string[] {
    return DAILY_METRIC_CATALOG.filter((metric) => metric.inputType === 'score').map((metric) => metric.key);
  }

  getLegacyTrackingSelection(user: LegacyTrackingUser): DailyTrackingSelection {
    return {
      trackMood: user.trackMood,
      trackEnergy: user.trackEnergy,
      trackStress: user.trackStress,
      trackSleep: user.trackSleep,
    };
  }

  private resolveEnabledState(
    definition: DailyMetricDefinition,
    user: LegacyTrackingUser,
    existing?: UserTrackedMetricWithDefinition,
  ): boolean {
    const legacyField = LEGACY_TRACKED_METRIC_MAP[
      definition.key as keyof typeof LEGACY_TRACKED_METRIC_MAP
    ];

    if (legacyField) {
      return user[legacyField];
    }

    if (existing) {
      return existing.isEnabled;
    }

    return definition.defaultEnabled;
  }
}
