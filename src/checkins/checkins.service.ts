import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DailyEntry, EventType } from '@prisma/client';

import { TEXT_LIMITS } from '../common/constants/app.constants';
import {
  buildNormalizedEntryDate,
  buildRelativeDayKey,
  formatDateKey,
  normalizeDayKeyToUtcDate,
  resolveTimezone,
} from '../common/utils/date.utils';
import {
  CHECKIN_V2_METRIC_BY_KEY,
  getScaleLabel,
  mapLegacyScoreToOrdinal,
  mapLegacyStressToCalmOrdinal,
  type CheckinV2MetricKey,
} from './checkins-v2.catalog';
import type { DailyMetricCatalogKey } from '../daily-metrics/daily-metrics.catalog';
import { DailyMetricsService } from '../daily-metrics/daily-metrics.service';
import { EventsService } from '../events/events.service';
import { TagsService } from '../tags/tags.service';
import { CheckinsRepository } from './checkins.repository';
import type { UpsertDailyEntryDto } from './dto/upsert-daily-entry.dto';

export interface TodayEntryOptions {
  date?: Date;
  timezone?: string | null;
}

export interface CheckinUpsertResult {
  entry: DailyEntry;
  isUpdate: boolean;
}

export interface RecentEntryView {
  id: string;
  entryDate: Date;
  moodScore: number | null;
  energyScore: number | null;
  stressScore: number | null;
  sleepHours?: number;
  sleepQuality?: number;
  extraMetricScores: ExtraMetricScoreView[];
  checkinMetrics: CheckinMetricValueView[];
  hasNote: boolean;
  tagsCount: number;
  eventsCount: number;
}

export interface ExtraMetricScoreView {
  key: DailyMetricCatalogKey;
  label: string;
  value: number;
}

export interface ExtraMetricAverageView {
  key: DailyMetricCatalogKey;
  label: string;
  average: number;
  observationsCount: number;
}

export type EntryWithExtraMetricScores = DailyEntry & {
  extraMetricScores: ExtraMetricScoreView[];
};

export type EntryWithV2MetricValues = DailyEntry & {
  checkinMetrics: CheckinMetricValueView[];
};

export interface CheckinMetricTagView {
  key: string;
  label: string;
}

export interface CheckinMetricValueView {
  key: CheckinV2MetricKey;
  label: string;
  ordinalValue: number;
  scaleLabel: string;
  tags: CheckinMetricTagView[];
}

export interface RecentEntriesPage {
  entries: RecentEntryView[];
  nextCursor?: string;
  staleCursor: boolean;
}

export interface HistoryEntryTagView {
  id: string;
  label: string;
}

export interface HistoryEntryEventView {
  id: string;
  eventType: EventType;
  title: string;
  description: string | null;
  eventScore: number;
  eventDate: Date;
  eventEndDate: Date | null;
}

export interface HistoryEntryDetailView {
  id: string;
  entryDate: Date;
  moodScore: number | null;
  energyScore: number | null;
  stressScore: number | null;
  sleepHours?: number;
  sleepQuality?: number;
  extraMetricScores: ExtraMetricScoreView[];
  checkinMetrics: CheckinMetricValueView[];
  noteText: string | null;
  tags: HistoryEntryTagView[];
  events: HistoryEntryEventView[];
}

@Injectable()
export class CheckinsService {
  private readonly logger = new Logger(CheckinsService.name);
  private readonly defaultTimezone: string;

  constructor(
    private readonly checkinsRepository: CheckinsRepository,
    private readonly eventsService: EventsService,
    private readonly tagsService: TagsService,
    private readonly dailyMetricsService: DailyMetricsService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTimezone =
      this.configService.get<string>('app.defaultTimezone', { infer: true }) ?? 'Europe/Berlin';
  }

  buildEntryDate(options: TodayEntryOptions = {}): Date {
    return buildNormalizedEntryDate(
      options.date ?? new Date(),
      options.timezone ?? undefined,
      this.defaultTimezone,
    );
  }

  buildRelativeEntryDate(offsetDays: number, options: TodayEntryOptions = {}): Date {
    const timezoneName = resolveTimezone(options.timezone, this.defaultTimezone);
    const dayKey = buildRelativeDayKey(options.date ?? new Date(), timezoneName, offsetDays);
    return normalizeDayKeyToUtcDate(dayKey);
  }

  buildEntryDateFromDayKey(dayKey: string): Date {
    return normalizeDayKeyToUtcDate(dayKey);
  }

  getTodayEntry(userId: string, options: TodayEntryOptions = {}) {
    const entryDate = this.buildEntryDate(options);
    return this.checkinsRepository.findByUserAndDate(userId, entryDate);
  }

  getYesterdayEntry(userId: string, options: TodayEntryOptions = {}) {
    const entryDate = this.buildRelativeEntryDate(-1, options);
    return this.checkinsRepository.findByUserAndDate(userId, entryDate);
  }

  async upsertTodayEntry(
    userId: string,
    payload: UpsertDailyEntryDto,
    options: TodayEntryOptions = {},
  ): Promise<CheckinUpsertResult> {
    const entryDate = this.buildEntryDate(options);
    return this.upsertEntryForDate(userId, payload, entryDate);
  }

  async upsertEntryForDate(
    userId: string,
    payload: UpsertDailyEntryDto,
    entryDate: Date,
  ): Promise<CheckinUpsertResult> {
    const existing = await this.checkinsRepository.findByUserAndDate(userId, entryDate);

    const entry = await this.checkinsRepository.upsertByUserAndDate(userId, entryDate, {
      moodScore: payload.moodScore,
      energyScore: payload.energyScore,
      stressScore: payload.stressScore,
      sleepHours: payload.sleepHours,
      sleepQuality: payload.sleepQuality,
      noteText: payload.noteText,
    });

    await this.upsertMetricValues(entry.id, payload.metricValues);
    await this.upsertV2MetricValues(entry.id, payload.v2MetricValues);

    this.logger.log(
      `${existing ? 'Updated' : 'Created'} daily entry ${entry.id} for user ${userId} on ${entryDate.toISOString().slice(0, 10)}`,
    );

    return {
      entry,
      isUpdate: !!existing,
    };
  }

  async saveNote(entryId: string, text: string): Promise<void> {
    const note = text.trim();

    if (note.length === 0 || note.length > TEXT_LIMITS.note) {
      throw new Error('INVALID_NOTE_LENGTH');
    }

    await this.checkinsRepository.updateNote(entryId, note);
  }

  async attachTags(entryId: string, tagIds: string[]): Promise<void> {
    const uniqueTagIds = [...new Set(tagIds)];

    if (uniqueTagIds.length === 0) {
      await this.checkinsRepository.replaceTags(entryId, []);
      return;
    }

    const activeTags = await this.tagsService.getActiveTags();
    const activeTagIds = new Set(activeTags.map((tag) => tag.id));
    const validTagIds = uniqueTagIds.filter((tagId) => activeTagIds.has(tagId));

    if (validTagIds.length !== uniqueTagIds.length) {
      throw new Error('INVALID_TAG_SELECTION');
    }

    await this.checkinsRepository.replaceTags(entryId, validTagIds);
  }

  getEntriesForPeriod(userId: string, from: Date, to: Date): Promise<DailyEntry[]> {
    return this.checkinsRepository.findByUserAndDateRange(userId, from, to);
  }

  async getEntriesForPeriodWithExtraMetrics(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<EntryWithExtraMetricScores[]> {
    const entries = await this.checkinsRepository.findByUserAndDateRange(userId, from, to);
    return this.attachExtraMetricScores(entries);
  }

  async getEntriesForPeriodWithV2Metrics(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<EntryWithV2MetricValues[]> {
    const entries = await this.checkinsRepository.findByUserAndDateRange(userId, from, to);
    return this.attachV2MetricValues(entries);
  }

  async getExtraMetricAveragesForPeriod(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<ExtraMetricAverageView[]> {
    const aggregates = await this.checkinsRepository.aggregateMetricAveragesByUserAndDateRange(userId, from, to);

    if (aggregates.length === 0) {
      return [];
    }

    const definitions = await this.dailyMetricsService.getDefinitionsByIds(
      [...new Set(aggregates.map((aggregate) => aggregate.metricDefinitionId))],
    );
    const definitionsById = new Map(definitions.map((definition) => [definition.id, definition] as const));

    return aggregates
      .map((aggregate) => {
        const definition = definitionsById.get(aggregate.metricDefinitionId);

        if (
          !definition ||
          definition.inputType !== 'score' ||
          this.isLegacyCoreMetricKey(definition.key)
        ) {
          return null;
        }

        return {
          key: definition.key as DailyMetricCatalogKey,
          label: definition.label,
          average: aggregate.average,
          observationsCount: aggregate.observationsCount,
        };
      })
      .filter((aggregate): aggregate is ExtraMetricAverageView => aggregate !== null)
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async getRecentEntries(userId: string, limit: number, _cursor?: string): Promise<RecentEntryView[]> {
    const page = await this.getRecentEntriesPage(userId, limit, _cursor);
    return page.entries;
  }

  async getRecentEntriesPage(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<RecentEntriesPage> {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 20) : 5;
    const cursorDate = this.parseHistoryCursor(cursor);

    if (cursor && !cursorDate) {
      return {
        entries: [],
        staleCursor: true,
      };
    }

    const rows = await this.checkinsRepository.findRecentByUser(userId, safeLimit + 1, cursorDate ?? undefined);
    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
    const pageRowsWithMetrics = await this.attachV2MetricValues(await this.attachExtraMetricScores(pageRows));
    const entries = await Promise.all(
      pageRowsWithMetrics.map(async (row) => {
        const [events, tagIds] = await Promise.all([
          this.eventsService.getEventsForDay(userId, row.entryDate),
          this.checkinsRepository.findTagIdsByEntryId(row.id),
        ]);

        return {
          id: row.id,
          entryDate: row.entryDate,
          moodScore: row.moodScore,
          energyScore: row.energyScore,
          stressScore: row.stressScore,
          sleepHours: row.sleepHours ? Number(row.sleepHours) : undefined,
          sleepQuality: row.sleepQuality ?? undefined,
          extraMetricScores: row.extraMetricScores,
          checkinMetrics: row.checkinMetrics,
          hasNote: !!row.noteText?.trim(),
          tagsCount: tagIds.length + this.countV2MetricTags(row.checkinMetrics),
          eventsCount: events.length,
        };
      }),
    );

    return {
      entries,
      nextCursor:
        hasMore && pageRows.length > 0 ? formatDateKey(pageRows[pageRows.length - 1].entryDate) : undefined,
      staleCursor: !!cursor && pageRows.length === 0,
    };
  }

  async countTodayEntry(userId: string, options: TodayEntryOptions = {}): Promise<number> {
    const current = await this.getTodayEntry(userId, options);
    return current ? 1 : 0;
  }

  async countYesterdayEntry(userId: string, options: TodayEntryOptions = {}): Promise<number> {
    const current = await this.getYesterdayEntry(userId, options);
    return current ? 1 : 0;
  }

  async getHistoryEntryDetail(userId: string, entryId: string): Promise<HistoryEntryDetailView | null> {
    const entry = await this.checkinsRepository.findByIdAndUser(userId, entryId);

    if (!entry) {
      return null;
    }

    const [entryWithMetrics] = await this.attachV2MetricValues(await this.attachExtraMetricScores([entry]));
    const [tagIds, events] = await Promise.all([
      this.checkinsRepository.findTagIdsByEntryId(entry.id),
      this.eventsService.getEventsForDay(userId, entry.entryDate),
    ]);
    const tags = await this.tagsService.resolveTagsByIds(tagIds);

    return {
      id: entry.id,
      entryDate: entry.entryDate,
      moodScore: entry.moodScore,
      energyScore: entry.energyScore,
      stressScore: entry.stressScore,
      sleepHours: entry.sleepHours ? Number(entry.sleepHours) : undefined,
      sleepQuality: entry.sleepQuality ?? undefined,
      extraMetricScores: entryWithMetrics.extraMetricScores,
      checkinMetrics: entryWithMetrics.checkinMetrics,
      noteText: entry.noteText?.trim() ? entry.noteText : null,
      tags: tags.map((tag) => ({
        id: tag.id,
        label: tag.label,
      })),
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        eventScore: event.eventScore,
        eventDate: event.eventDate,
        eventEndDate: event.eventEndDate,
      })),
    };
  }

  private parseHistoryCursor(cursor?: string): Date | null {
    if (!cursor) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(cursor)) {
      return null;
    }

    const entryDate = normalizeDayKeyToUtcDate(cursor);

    if (Number.isNaN(entryDate.getTime()) || formatDateKey(entryDate) !== cursor) {
      return null;
    }

    return entryDate;
  }

  private async upsertMetricValues(
    dailyEntryId: string,
    metricValues: UpsertDailyEntryDto['metricValues'],
  ): Promise<void> {
    if (!metricValues || metricValues.length === 0) {
      return;
    }

    const uniqueValues = [...new Map(metricValues.map((item) => [item.key, item])).values()];
    const definitions = await this.dailyMetricsService.getActiveDefinitions();
    const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition] as const));

    const valuesToPersist = uniqueValues
      .map((item) => {
        const definition = definitionByKey.get(item.key);

        if (!definition) {
          return null;
        }

        return {
          metricDefinitionId: definition.id,
          value: item.value,
        };
      })
      .filter((item): item is { metricDefinitionId: string; value: number } => item !== null);

    if (valuesToPersist.length === 0) {
      return;
    }

    await this.checkinsRepository.upsertMetricValues(dailyEntryId, valuesToPersist);
  }

  private async upsertV2MetricValues(
    dailyEntryId: string,
    metricValues: UpsertDailyEntryDto['v2MetricValues'],
  ): Promise<void> {
    if (!metricValues || metricValues.length === 0) {
      return;
    }

    const uniqueValues = [...new Map(metricValues.map((item) => [item.key, item])).values()]
      .filter((item) => item.key in CHECKIN_V2_METRIC_BY_KEY)
      .map((item) => ({
        metricKey: item.key,
        ordinalValue: item.ordinalValue,
        tagKeys: item.tagKeys,
      }));

    if (uniqueValues.length === 0) {
      return;
    }

    await this.checkinsRepository.replaceV2MetricValues(dailyEntryId, uniqueValues);
  }

  private async attachExtraMetricScores<T extends { id: string }>(
    entries: T[],
  ): Promise<Array<T & { extraMetricScores: ExtraMetricScoreView[] }>> {
    if (entries.length === 0) {
      return [];
    }

    const metricValues = await this.checkinsRepository.findMetricValuesByEntryIds(entries.map((entry) => entry.id));

    if (metricValues.length === 0) {
      return entries.map((entry) => ({
        ...entry,
        extraMetricScores: [],
      }));
    }

    const definitions = await this.dailyMetricsService.getDefinitionsByIds(
      [...new Set(metricValues.map((metricValue) => metricValue.metricDefinitionId))],
    );
    const definitionsById = new Map(definitions.map((definition) => [definition.id, definition] as const));
    const definitionSortOrderByKey = new Map(
      definitions.map((definition) => [definition.key, definition.sortOrder] as const),
    );
    const groupedScores = new Map<string, ExtraMetricScoreView[]>();

    for (const metricValue of metricValues) {
      const definition = definitionsById.get(metricValue.metricDefinitionId);

      if (
        !definition ||
        definition.inputType !== 'score' ||
        this.isLegacyCoreMetricKey(definition.key)
      ) {
        continue;
      }

      const bucket = groupedScores.get(metricValue.dailyEntryId) ?? [];
      bucket.push({
        key: definition.key as DailyMetricCatalogKey,
        label: definition.label,
        value: metricValue.value,
      });
      groupedScores.set(metricValue.dailyEntryId, bucket);
    }

    return entries.map((entry) => ({
      ...entry,
      extraMetricScores: (groupedScores.get(entry.id) ?? []).sort(
        (left, right) => {
          const sortDelta =
            (definitionSortOrderByKey.get(left.key) ?? 0) - (definitionSortOrderByKey.get(right.key) ?? 0);

          if (sortDelta !== 0) {
            return sortDelta;
          }

          return left.label.localeCompare(right.label);
        },
      ),
    }));
  }

  private async attachV2MetricValues<T extends DailyEntry>(
    entries: T[],
  ): Promise<Array<T & { checkinMetrics: CheckinMetricValueView[] }>> {
    if (entries.length === 0) {
      return [];
    }

    const metricValues = await this.checkinsRepository.findV2MetricValuesByEntryIds(entries.map((entry) => entry.id));
    const grouped = new Map<string, CheckinMetricValueView[]>();

    for (const metricValue of metricValues) {
      const definition = CHECKIN_V2_METRIC_BY_KEY[metricValue.metricKey as CheckinV2MetricKey];

      if (!definition) {
        continue;
      }

      const scaleLabel = getScaleLabel(definition.scale, metricValue.ordinalValue);

      if (!scaleLabel) {
        continue;
      }

      const tagByKey = new Map(definition.tags.map((tag) => [tag.key, tag] as const));
      const bucket = grouped.get(metricValue.dailyEntryId) ?? [];
      bucket.push({
        key: definition.key,
        label: definition.label,
        ordinalValue: metricValue.ordinalValue,
        scaleLabel,
        tags: metricValue.tags
          .map((tag) => tagByKey.get(tag.tagKey))
          .filter((tag): tag is NonNullable<typeof tag> => !!tag)
          .map((tag) => ({
            key: tag.key,
            label: tag.label,
          })),
      });
      grouped.set(metricValue.dailyEntryId, bucket);
    }

    return entries.map((entry) => {
      const storedMetrics = grouped.get(entry.id) ?? [];
      const storedKeys = new Set(storedMetrics.map((metric) => metric.key));
      const legacyMetrics = this.buildLegacyV2MetricValues(entry).filter((metric) => !storedKeys.has(metric.key));
      const checkinMetrics = [...storedMetrics, ...legacyMetrics];
      const extraMetricScores = this.filterExtraMetricScoresForV2Entry(entry, checkinMetrics);

      return {
        ...entry,
        ...(extraMetricScores ? { extraMetricScores } : {}),
        checkinMetrics: checkinMetrics.sort((left, right) => {
          const leftOrder = CHECKIN_V2_METRIC_BY_KEY[left.key]?.sortOrder ?? 0;
          const rightOrder = CHECKIN_V2_METRIC_BY_KEY[right.key]?.sortOrder ?? 0;
          return leftOrder - rightOrder || left.label.localeCompare(right.label);
        }),
      };
    });
  }

  private filterExtraMetricScoresForV2Entry<T extends DailyEntry>(
    entry: T,
    checkinMetrics: CheckinMetricValueView[],
  ): ExtraMetricScoreView[] | null {
    if (!this.hasExtraMetricScores(entry)) {
      return null;
    }

    if (checkinMetrics.length === 0) {
      return entry.extraMetricScores;
    }

    return entry.extraMetricScores.filter((metric) => !this.mapLegacyExtraMetricKeyToV2Key(metric.key));
  }

  private hasExtraMetricScores(entry: DailyEntry): entry is DailyEntry & { extraMetricScores: ExtraMetricScoreView[] } {
    return Array.isArray((entry as { extraMetricScores?: unknown }).extraMetricScores);
  }

  private buildLegacyV2MetricValues(entry: DailyEntry): CheckinMetricValueView[] {
    const legacyValues: CheckinMetricValueView[] = [];

    if (typeof entry.moodScore === 'number') {
      legacyValues.push(this.toMetricValueView('mood', mapLegacyScoreToOrdinal(entry.moodScore), []));
    }

    if (typeof entry.energyScore === 'number') {
      legacyValues.push(this.toMetricValueView('energy', mapLegacyScoreToOrdinal(entry.energyScore), []));
    }

    if (typeof entry.stressScore === 'number') {
      legacyValues.push(this.toMetricValueView('calm', mapLegacyStressToCalmOrdinal(entry.stressScore), []));
    }

    return legacyValues;
  }

  private toMetricValueView(
    key: CheckinV2MetricKey,
    ordinalValue: number,
    tags: CheckinMetricTagView[],
  ): CheckinMetricValueView {
    const definition = CHECKIN_V2_METRIC_BY_KEY[key];

    return {
      key,
      label: definition.label,
      ordinalValue,
      scaleLabel: getScaleLabel(definition.scale, ordinalValue) ?? String(ordinalValue),
      tags,
    };
  }

  private countV2MetricTags(metrics: CheckinMetricValueView[]): number {
    return metrics.reduce((sum, metric) => sum + metric.tags.length, 0);
  }

  private isLegacyCoreMetricKey(key: string): key is 'mood' | 'energy' | 'stress' {
    return key === 'mood' || key === 'energy' || key === 'stress';
  }

  private mapLegacyExtraMetricKeyToV2Key(key: string): CheckinV2MetricKey | null {
    if (key === 'motivation' || key === 'motivation_score') {
      return 'motivation';
    }

    if (key === 'wellbeing') {
      return 'overall_state';
    }

    if (key === 'concentration') {
      return 'clarity';
    }

    return null;
  }
}
