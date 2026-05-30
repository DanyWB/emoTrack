import { Injectable, Logger } from '@nestjs/common';
import type { DailyMetricDefinition, User } from '@prisma/client';

import {
  CHECKIN_V2_MAX_OPTIONAL_METRICS,
  CHECKIN_V2_METRICS,
  isCheckinV2CoreMetricKey,
  isCheckinV2MetricKey,
  isCheckinV2OptionalMetricKey,
  type CheckinV2MetricKey,
} from '../checkins/checkins-v2.catalog';
import { formatLogEvent } from '../common/utils/logging.utils';
import { type DailyTrackingSelection } from '../common/utils/validation.utils';
import {
  type DailyMetricCatalogKey,
  LEGACY_TRACKED_METRIC_MAP,
} from './daily-metrics.catalog';
import {
  DailyMetricsRepository,
  type UpsertUserMetricPreferenceInput,
  type UpsertUserTrackedMetricInput,
  type UserTrackedMetricWithDefinition,
} from './daily-metrics.repository';

type TrackingUser = Pick<
  User,
  'id' | 'trackMood' | 'trackEnergy' | 'trackStress' | 'trackSleep'
>;

export type CoreDailyMetricKey = CheckinV2MetricKey;

export interface TrackedMetricSettingsItem {
  key: DailyMetricCatalogKey;
  label: string;
  enabled: boolean;
  sortOrder: number;
  inputType: DailyMetricDefinition['inputType'];
  isCore: boolean;
  isSleep: boolean;
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

  async ensureUserTrackedMetrics(user: TrackingUser): Promise<void> {
    await Promise.all([
      this.ensureLegacyTrackedMetricRows(user),
      this.ensureProductMetricPreferences(user),
    ]);
  }

  async getUserTrackedMetricsForSettings(user: TrackingUser): Promise<TrackedMetricSettingsItem[]> {
    await this.ensureUserTrackedMetrics(user);

    const preferences = await this.dailyMetricsRepository.findUserMetricPreferences(user.id);
    const preferenceByKey = new Map(preferences.map((preference) => [preference.metricKey, preference] as const));

    const stateMetrics = CHECKIN_V2_METRICS.map((metric) => {
      const preference = preferenceByKey.get(metric.key);
      const isCore = metric.type === 'core';

      return {
        key: metric.key as DailyMetricCatalogKey,
        label: metric.label,
        enabled: isCore ? true : (preference?.enabled ?? metric.defaultEnabled),
        sortOrder: preference?.sortOrder ?? metric.sortOrder,
        inputType: 'score' as DailyMetricDefinition['inputType'],
        isCore,
        isSleep: false,
      };
    });

    stateMetrics.push({
      key: 'sleep' as DailyMetricCatalogKey,
      label: 'Сон',
      enabled: user.trackSleep,
      sortOrder: 90,
      inputType: 'sleep_block' as DailyMetricDefinition['inputType'],
      isCore: false,
      isSleep: true,
    });

    return stateMetrics.sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));
  }

  async getEnabledCheckinMetrics(user: TrackingUser): Promise<EnabledCheckinMetric[]> {
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

    const stateMetrics = metrics.filter((metric) => metric.key !== 'sleep');
    const normalized = this.normalizeProductPreferences(stateMetrics);

    await this.dailyMetricsRepository.upsertUserMetricPreferences(userId, normalized);

    const definitions = await this.dailyMetricsRepository.findDefinitionsByKeys(metrics.map((metric) => metric.key));
    const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition] as const));
    const legacyPayload: UpsertUserTrackedMetricInput[] = metrics
      .map((metric) => {
        const definition = definitionByKey.get(metric.key);

        if (!definition) {
          return null;
        }

        return {
          metricDefinitionId: definition.id,
          isEnabled: metric.enabled,
          sortOrder: metric.sortOrder,
        };
      })
      .filter((item): item is UpsertUserTrackedMetricInput => item !== null);

    if (legacyPayload.length > 0) {
      await this.dailyMetricsRepository.upsertUserTrackedMetrics(userId, legacyPayload);
    }
  }

  getAvailableScoreMetricKeys(): string[] {
    return CHECKIN_V2_METRICS.map((metric) => metric.key);
  }

  getLegacyTrackingSelection(user: TrackingUser): DailyTrackingSelection {
    return {
      trackMood: true,
      trackEnergy: true,
      trackStress: true,
      trackSleep: user.trackSleep,
    };
  }

  private async ensureLegacyTrackedMetricRows(user: TrackingUser): Promise<void> {
    const [definitions, existingMetrics] = await Promise.all([
      this.dailyMetricsRepository.findActiveDefinitions(),
      this.dailyMetricsRepository.findUserTrackedMetrics(user.id),
    ]);

    if (definitions.length === 0) {
      this.logger.warn(formatLogEvent('daily_metric_catalog_empty', {
        userId: user.id,
      }));
      return;
    }

    const existingByDefinitionId = new Map(
      existingMetrics.map((metric) => [metric.metricDefinitionId, metric] as const),
    );

    const syncPayload: UpsertUserTrackedMetricInput[] = definitions.map((definition) => {
      const existing = existingByDefinitionId.get(definition.id);
      const legacyField = LEGACY_TRACKED_METRIC_MAP[
        definition.key as keyof typeof LEGACY_TRACKED_METRIC_MAP
      ];

      return {
        metricDefinitionId: definition.id,
        isEnabled: legacyField ? user[legacyField] : (existing?.isEnabled ?? definition.defaultEnabled),
        sortOrder: existing?.sortOrder ?? definition.sortOrder,
      };
    });

    await this.dailyMetricsRepository.upsertUserTrackedMetrics(user.id, syncPayload);
  }

  private async ensureProductMetricPreferences(user: TrackingUser): Promise<void> {
    const existingPreferences = await this.dailyMetricsRepository.findUserMetricPreferences(user.id);
    const existingByKey = new Map(existingPreferences.map((preference) => [preference.metricKey, preference] as const));

    const payload = CHECKIN_V2_METRICS.map((metric): UpsertUserMetricPreferenceInput => {
      const existing = existingByKey.get(metric.key);
      const isCore = metric.type === 'core';

      return {
        metricKey: metric.key,
        enabled: isCore ? true : (existing?.enabled ?? metric.defaultEnabled),
        sortOrder: existing?.sortOrder ?? metric.sortOrder,
      };
    });

    await this.dailyMetricsRepository.upsertUserMetricPreferences(user.id, payload);
  }

  private normalizeProductPreferences(
    metrics: Array<Pick<TrackedMetricSettingsItem, 'key' | 'enabled' | 'sortOrder'>>,
  ): UpsertUserMetricPreferenceInput[] {
    const enabledOptionalCount = metrics.filter(
      (metric) => isCheckinV2OptionalMetricKey(metric.key) && metric.enabled,
    ).length;

    if (enabledOptionalCount > CHECKIN_V2_MAX_OPTIONAL_METRICS) {
      throw new Error('TOO_MANY_OPTIONAL_CHECKIN_METRICS');
    }

    return metrics
      .filter((metric) => isCheckinV2MetricKey(metric.key))
      .map((metric) => ({
        metricKey: metric.key,
        enabled: isCheckinV2CoreMetricKey(metric.key) ? true : metric.enabled,
        sortOrder: metric.sortOrder,
      }));
  }
}
