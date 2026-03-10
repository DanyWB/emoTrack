import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DailyEntry } from '@prisma/client';

import { buildNormalizedEntryDate } from '../common/utils/date.utils';
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

@Injectable()
export class CheckinsService {
  private readonly defaultTimezone: string;

  constructor(
    private readonly checkinsRepository: CheckinsRepository,
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

    return {
      entry,
      isUpdate: !!existing,
    };
  }

  saveNote(_entryId: string, _text: string): Promise<void> {
    return Promise.resolve();
  }

  attachTags(_entryId: string, _tagIds: string[]): Promise<void> {
    return Promise.resolve();
  }

  getEntriesForPeriod(_userId: string, _from: Date, _to: Date): Promise<unknown[]> {
    return Promise.resolve([]);
  }

  getRecentEntries(_userId: string, _limit: number, _cursor?: string): Promise<unknown[]> {
    return Promise.resolve([]);
  }

  async countTodayEntry(userId: string, options: TodayEntryOptions = {}): Promise<number> {
    const current = await this.getTodayEntry(userId, options);
    return current ? 1 : 0;
  }
}