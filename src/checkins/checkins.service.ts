import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DailyEntry } from '@prisma/client';

import { TEXT_LIMITS } from '../common/constants/app.constants';
import { buildNormalizedEntryDate, formatDateKey, normalizeDayKeyToUtcDate } from '../common/utils/date.utils';
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
  moodScore: number;
  energyScore: number;
  stressScore: number;
  sleepHours?: number;
  sleepQuality?: number;
  hasNote: boolean;
  eventsCount: number;
}

export interface RecentEntriesPage {
  entries: RecentEntryView[];
  nextCursor?: string;
  staleCursor: boolean;
}

@Injectable()
export class CheckinsService {
  private readonly logger = new Logger(CheckinsService.name);
  private readonly defaultTimezone: string;

  constructor(
    private readonly checkinsRepository: CheckinsRepository,
    private readonly eventsService: EventsService,
    private readonly tagsService: TagsService,
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

  getTodayEntry(userId: string, options: TodayEntryOptions = {}) {
    const entryDate = this.buildEntryDate(options);
    return this.checkinsRepository.findByUserAndDate(userId, entryDate);
  }

  async upsertTodayEntry(
    userId: string,
    payload: UpsertDailyEntryDto,
    options: TodayEntryOptions = {},
  ): Promise<CheckinUpsertResult> {
    const entryDate = this.buildEntryDate(options);
    const existing = await this.checkinsRepository.findByUserAndDate(userId, entryDate);

    const entry = await this.checkinsRepository.upsertByUserAndDate(userId, entryDate, {
      moodScore: payload.moodScore,
      energyScore: payload.energyScore,
      stressScore: payload.stressScore,
      sleepHours: payload.sleepHours,
      sleepQuality: payload.sleepQuality,
      noteText: payload.noteText,
    });

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
    const entries = await Promise.all(
      pageRows.map(async (row) => {
        const events = await this.eventsService.getEventsForDay(userId, row.entryDate);

        return {
          id: row.id,
          entryDate: row.entryDate,
          moodScore: row.moodScore,
          energyScore: row.energyScore,
          stressScore: row.stressScore,
          sleepHours: row.sleepHours ? Number(row.sleepHours) : undefined,
          sleepQuality: row.sleepQuality ?? undefined,
          hasNote: !!row.noteText?.trim(),
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
}
