import { Injectable, Logger } from '@nestjs/common';
import type { DailyMetricDefinition, User } from '@prisma/client';

import { type DailyTrackingSelection } from '../common/utils/validation.utils';
import {
  DAILY_METRIC_CATALOG,
  type DailyMetricCatalogKey,
  LEGACY_TRACKED_METRIC_MAP,
} from './daily-metrics.catalog';
import {
  DailyMetricsRepository,
  type UpsertUserTrackedMetricInput,
  type UserTrackedMetricWithDefinition,
} from './daily-metrics.repository';

type LegacyTrackingUser = Pick<
  User,
  'id' | 'trackMood' | 'trackEnergy' | 'trackStress' | 'trackSleep'
>;

export type CoreDailyMetricKey = keyof typeof LEGACY_TRACKED_METRIC_MAP;

export interface TrackedMetricSettingsItem {
  key: DailyMetricCatalogKey;
  label: string;
  enabled: boolean;
  sortOrder: number;
  inputType: DailyMetricDefinition['inputType'];
  isCore: boolean;
}

export interface EnabledCheckinMetric {
  key: DailyMetricCatalogKey;
  label: string;
  inputType: DailyMetricDefinition['inputType'];
  sortOrder: number;
  isCore: boolean;
}

@Injectable()
export class DailyMetricsService {
  private readonly logger = new Logger(DailyMetricsService.name);

  constructor(private readonly dailyMetricsRepository: DailyMetricsRepository) {}

  getActiveDefinitions(): Promise<DailyMetricDefinition[]> {
    return this.dailyMetricsRepository.findActiveDefinitions();
  }

  getDefinitionsByIds(ids: string[]): Promise<DailyMetricDefinition[]> {
    return this.dailyMetricsRepository.findDefinitionsByIds(ids);
  }

  getDefinitionsByKeys(keys: string[]): Promise<DailyMetricDefinition[]> {
    return this.dailyMetricsRepository.findDefinitionsByKeys(keys);
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

  async getUserTrackedMetricsForSettings(user: LegacyTrackingUser): Promise<TrackedMetricSettingsItem[]> {
    await this.ensureUserTrackedMetrics(user);

    const trackedMetrics = await this.dailyMetricsRepository.findUserTrackedMetrics(user.id);

    return trackedMetrics
      .map((metric) => ({
        key: metric.metricDefinition.key as DailyMetricCatalogKey,
        label: metric.metricDefinition.label,
        enabled: metric.isEnabled,
        sortOrder: metric.sortOrder,
        inputType: metric.metricDefinition.inputType,
        isCore: this.isCoreMetricKey(metric.metricDefinition.key),
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));
  }

  async getEnabledCheckinMetrics(user: LegacyTrackingUser): Promise<EnabledCheckinMetric[]> {
    const metrics = await this.getUserTrackedMetricsForSettings(user);

    return metrics
      .filter((metric) => metric.enabled)
      .map((metric) => ({
        key: metric.key,
        label: metric.label,
        inputType: metric.inputType,
        sortOrder: metric.sortOrder,
        isCore: metric.isCore,
      }));
  }

  async persistTrackedMetricSettings(
    userId: string,
    metrics: Array<Pick<TrackedMetricSettingsItem, 'key' | 'enabled' | 'sortOrder'>>,
  ): Promise<void> {
    if (metrics.length === 0) {
      return;
    }

    const definitions = await this.dailyMetricsRepository.findDefinitionsByKeys(metrics.map((metric) => metric.key));
    const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition] as const));

    const payload: UpsertUserTrackedMetricInput[] = metrics.map((metric) => {
      const definition = definitionByKey.get(metric.key);

      if (!definition) {
        throw new Error(`Daily metric definition ${metric.key} not found`);
      }

      return {
        metricDefinitionId: definition.id,
        isEnabled: metric.enabled,
        sortOrder: metric.sortOrder,
      };
    });

    await this.dailyMetricsRepository.upsertUserTrackedMetrics(userId, payload);
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

  private isCoreMetricKey(key: string): key is CoreDailyMetricKey {
    return key in LEGACY_TRACKED_METRIC_MAP;
  }
}
