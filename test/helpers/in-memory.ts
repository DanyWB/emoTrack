import { randomUUID } from 'node:crypto';
import {
  Prisma,
  SleepMode,
  type DailyEntry,
  type DailyEntryTag,
  type Event,
  type FsmSession,
  type PredefinedTag,
  type ProductEvent,
  type Summary,
  type User,
} from '@prisma/client';
import type { ConfigService } from '@nestjs/config';

type PlainObject = Record<string, unknown>;

function mergeDefined<T extends PlainObject>(target: T, patch: PlainObject): T {
  const next = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      next[key as keyof T] = value as T[keyof T];
    }
  }

  return next;
}

function getNestedValue(source: PlainObject, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== 'object') {
      return undefined;
    }

    return (acc as PlainObject)[part];
  }, source);
}

export function createConfigService(overrides: PlainObject = {}): ConfigService {
  const values: PlainObject = {
    app: {
      defaultTimezone: 'Europe/Berlin',
      jobsEnabled: false,
      redisEnabled: false,
      nodeEnv: 'test',
      ...((overrides.app as PlainObject | undefined) ?? {}),
    },
    telegram: {
      botToken: 'replace_with_real_token',
      mode: 'polling',
      ...((overrides.telegram as PlainObject | undefined) ?? {}),
    },
    ...overrides,
  };

  return {
    get<T>(key: string): T | undefined {
      return getNestedValue(values, key) as T | undefined;
    },
  } as ConfigService;
}

export class InMemoryUsersRepository {
  private readonly users = new Map<string, User>();

  async findByTelegramId(telegramId: bigint): Promise<User | null> {
    return [...this.users.values()].find((user) => user.telegramId === telegramId) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async create(data: Record<string, unknown>): Promise<User> {
    const now = new Date();
    const user: User = {
      id: (data.id as string | undefined) ?? randomUUID(),
      telegramId: BigInt(data.telegramId as bigint | string | number),
      username: (data.username as string | undefined) ?? null,
      firstName: (data.firstName as string | undefined) ?? null,
      languageCode: (data.languageCode as string | undefined) ?? 'ru',
      timezone: (data.timezone as string | undefined) ?? 'Europe/Berlin',
      onboardingCompleted: (data.onboardingCompleted as boolean | undefined) ?? false,
      consentGiven: (data.consentGiven as boolean | undefined) ?? false,
      remindersEnabled: (data.remindersEnabled as boolean | undefined) ?? true,
      reminderTime: (data.reminderTime as string | undefined) ?? null,
      sleepMode: (data.sleepMode as SleepMode | undefined) ?? SleepMode.both,
      notesEnabled: (data.notesEnabled as boolean | undefined) ?? true,
      tagsEnabled: (data.tagsEnabled as boolean | undefined) ?? true,
      eventsEnabled: (data.eventsEnabled as boolean | undefined) ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(user.id, user);
    return user;
  }

  async update(id: string, data: Record<string, unknown>): Promise<User> {
    const current = this.users.get(id);

    if (!current) {
      throw new Error(`User ${id} not found`);
    }

    const next = mergeDefined(current as PlainObject, data);
    const updated: User = {
      ...(next as unknown as User),
      updatedAt: new Date(),
    };

    this.users.set(id, updated);
    return updated;
  }

  updateSettings(id: string, data: Record<string, unknown>): Promise<User> {
    return this.update(id, data);
  }

  setReminderTime(id: string, reminderTime: string): Promise<User> {
    return this.update(id, { reminderTime });
  }

  setConsentGiven(id: string, consentGiven: boolean): Promise<User> {
    return this.update(id, { consentGiven });
  }

  updateTelegramProfile(id: string, profile: Record<string, unknown>): Promise<User> {
    return this.update(id, profile);
  }

  setSleepMode(id: string, sleepMode: SleepMode): Promise<User> {
    return this.update(id, { sleepMode });
  }

  completeOnboarding(id: string): Promise<User> {
    return this.update(id, { onboardingCompleted: true });
  }
}

export class InMemoryFsmRepository {
  private readonly sessions = new Map<string, FsmSession>();

  async getByUserId(userId: string): Promise<FsmSession | null> {
    return this.sessions.get(userId) ?? null;
  }

  async upsert(userId: string, state: string, payloadJson: Record<string, unknown>): Promise<FsmSession> {
    const current = this.sessions.get(userId);
    const next: FsmSession = {
      id: current?.id ?? randomUUID(),
      userId,
      state,
      payloadJson: payloadJson as Prisma.JsonValue,
      updatedAt: new Date(),
    };

    this.sessions.set(userId, next);
    return next;
  }

  async deleteByUserId(userId: string): Promise<FsmSession> {
    const existing = this.sessions.get(userId);

    if (!existing) {
      throw new Error(`Session ${userId} not found`);
    }

    this.sessions.delete(userId);
    return existing;
  }
}

type RecentEntry = DailyEntry & { _count: { events: number } };

export class InMemoryCheckinsRepository {
  private readonly entries = new Map<string, DailyEntry>();
  private readonly tagsByEntry = new Map<string, string[]>();
  private readonly eventCounts = new Map<string, number>();

  async findByUserAndDate(userId: string, entryDate: Date): Promise<DailyEntry | null> {
    return this.entries.get(this.buildKey(userId, entryDate)) ?? null;
  }

  async upsertByUserAndDate(
    userId: string,
    entryDate: Date,
    data: Record<string, unknown>,
  ): Promise<DailyEntry> {
    const key = this.buildKey(userId, entryDate);
    const existing = this.entries.get(key);
    const now = new Date();

    const entry: DailyEntry = {
      id: existing?.id ?? randomUUID(),
      userId,
      entryDate,
      moodScore: data.moodScore as number,
      energyScore: data.energyScore as number,
      stressScore: data.stressScore as number,
      sleepHours:
        data.sleepHours === undefined || data.sleepHours === null
          ? null
          : new Prisma.Decimal(data.sleepHours as number),
      sleepQuality: (data.sleepQuality as number | undefined) ?? null,
      noteText: (data.noteText as string | undefined) ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.entries.set(key, entry);
    return entry;
  }

  async updateNote(entryId: string, noteText: string): Promise<DailyEntry> {
    const entry = this.findById(entryId);

    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    entry.noteText = noteText;
    entry.updatedAt = new Date();
    this.entries.set(this.buildKey(entry.userId, entry.entryDate), entry);
    return entry;
  }

  async replaceTags(entryId: string, tagIds: string[]): Promise<DailyEntryTag[]> {
    this.tagsByEntry.set(entryId, [...tagIds]);
    return tagIds.map((tagId) => ({
      id: randomUUID(),
      dailyEntryId: entryId,
      tagId,
    }));
  }

  async findRecentByUser(userId: string, limit: number): Promise<RecentEntry[]> {
    return [...this.entries.values()]
      .filter((entry) => entry.userId === userId)
      .sort((left, right) => right.entryDate.getTime() - left.entryDate.getTime())
      .slice(0, limit)
      .map((entry) => ({
        ...entry,
        _count: {
          events: this.eventCounts.get(entry.id) ?? 0,
        },
      }));
  }

  async findByUserAndDateRange(userId: string, from: Date, to: Date): Promise<DailyEntry[]> {
    return [...this.entries.values()]
      .filter(
        (entry) =>
          entry.userId === userId &&
          entry.entryDate.getTime() >= from.getTime() &&
          entry.entryDate.getTime() <= to.getTime(),
      )
      .sort((left, right) => left.entryDate.getTime() - right.entryDate.getTime());
  }

  listEntries(): DailyEntry[] {
    return [...this.entries.values()].sort((left, right) => left.entryDate.getTime() - right.entryDate.getTime());
  }

  setEventCount(entryId: string, count: number): void {
    this.eventCounts.set(entryId, count);
  }

  private findById(entryId: string): DailyEntry | null {
    return [...this.entries.values()].find((entry) => entry.id === entryId) ?? null;
  }

  private buildKey(userId: string, entryDate: Date): string {
    return `${userId}:${entryDate.toISOString()}`;
  }
}

export class InMemorySummariesRepository {
  readonly summaries: Summary[] = [];

  async create(data: Record<string, unknown>): Promise<Summary> {
    const summary: Summary = {
      id: randomUUID(),
      userId: data.userId as string,
      periodType: data.periodType as Summary['periodType'],
      periodStart: data.periodStart as Date,
      periodEnd: data.periodEnd as Date,
      payloadJson: data.payloadJson as Prisma.JsonValue,
      generatedAt: new Date(),
    };

    this.summaries.push(summary);
    return summary;
  }
}

export class InMemoryEventsRepository {
  private readonly events = new Map<string, Event>();

  async create(data: Record<string, unknown>): Promise<Event> {
    const now = new Date();
    const event: Event = {
      id: (data.id as string | undefined) ?? randomUUID(),
      userId: data.userId as string,
      dailyEntryId: (data.dailyEntryId as string | undefined) ?? null,
      eventDate: data.eventDate as Date,
      eventType: data.eventType as Event['eventType'],
      title: data.title as string,
      description: (data.description as string | undefined) ?? null,
      eventScore: data.eventScore as number,
      createdAt: now,
      updatedAt: now,
    };

    this.events.set(event.id, event);
    return event;
  }

  async update(eventId: string, data: Record<string, unknown>): Promise<Event> {
    const current = this.events.get(eventId);

    if (!current) {
      throw new Error(`Event ${eventId} not found`);
    }

    const dailyEntryConnect = ((data.dailyEntry as PlainObject | undefined)?.connect as PlainObject | undefined)?.id;
    const updated: Event = {
      ...current,
      dailyEntryId: (dailyEntryConnect as string | undefined) ?? current.dailyEntryId,
      updatedAt: new Date(),
    };

    this.events.set(eventId, updated);
    return updated;
  }

  async findByUserAndDay(userId: string, eventDate: Date): Promise<Event[]> {
    return [...this.events.values()]
      .filter((event) => event.userId === userId && event.eventDate.getTime() === eventDate.getTime())
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  async findByUserAndPeriod(userId: string, from: Date, to: Date): Promise<Event[]> {
    return [...this.events.values()]
      .filter(
        (event) =>
          event.userId === userId &&
          event.eventDate.getTime() >= from.getTime() &&
          event.eventDate.getTime() <= to.getTime(),
      )
      .sort((left, right) => {
        if (left.eventDate.getTime() !== right.eventDate.getTime()) {
          return right.eventDate.getTime() - left.eventDate.getTime();
        }

        return right.createdAt.getTime() - left.createdAt.getTime();
      });
  }

  listEvents(): Event[] {
    return [...this.events.values()].sort((left, right) => left.eventDate.getTime() - right.eventDate.getTime());
  }
}

export class InMemoryTagsRepository {
  private readonly tags = new Map<string, PredefinedTag>();

  constructor(seed: PredefinedTag[] = [buildTag(), buildTag({ id: 'tag-2', key: 'calm', label: 'Спокойствие' })]) {
    for (const tag of seed) {
      this.tags.set(tag.id, tag);
    }
  }

  async findActive(): Promise<PredefinedTag[]> {
    return [...this.tags.values()]
      .filter((tag) => tag.isActive)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));
  }

  async findByKeys(keys: string[]): Promise<PredefinedTag[]> {
    return [...this.tags.values()].filter((tag) => keys.includes(tag.key));
  }

  async findActiveByIds(ids: string[]): Promise<PredefinedTag[]> {
    return [...this.tags.values()]
      .filter((tag) => tag.isActive && ids.includes(tag.id))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));
  }

  async findActiveById(id: string): Promise<PredefinedTag | null> {
    const tag = this.tags.get(id) ?? null;

    if (!tag?.isActive) {
      return null;
    }

    return tag;
  }
}

export class InMemoryAnalyticsRepository {
  readonly events: ProductEvent[] = [];

  async create(eventName: string, payloadJson: Record<string, unknown>, userId?: string): Promise<ProductEvent> {
    const event: ProductEvent = {
      id: randomUUID(),
      userId: userId ?? null,
      eventName,
      payloadJson: payloadJson as Prisma.JsonValue,
      createdAt: new Date(),
    };

    this.events.push(event);
    return event;
  }
}

export function buildDailyEntry(overrides: Partial<DailyEntry> = {}): DailyEntry {
  return {
    id: overrides.id ?? randomUUID(),
    userId: overrides.userId ?? 'user-1',
    entryDate: overrides.entryDate ?? new Date('2026-03-11T00:00:00.000Z'),
    moodScore: overrides.moodScore ?? 5,
    energyScore: overrides.energyScore ?? 5,
    stressScore: overrides.stressScore ?? 5,
    sleepHours:
      overrides.sleepHours === undefined
        ? new Prisma.Decimal(7.5)
        : overrides.sleepHours,
    sleepQuality: overrides.sleepQuality ?? 7,
    noteText: overrides.noteText ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-03-11T09:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-03-11T09:05:00.000Z'),
  };
}

export function buildEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: overrides.id ?? randomUUID(),
    userId: overrides.userId ?? 'user-1',
    dailyEntryId: overrides.dailyEntryId ?? null,
    eventDate: overrides.eventDate ?? new Date('2026-03-11T00:00:00.000Z'),
    eventType: overrides.eventType ?? 'work',
    title: overrides.title ?? 'Work block',
    description: overrides.description ?? null,
    eventScore: overrides.eventScore ?? 6,
    createdAt: overrides.createdAt ?? new Date('2026-03-11T10:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-03-11T10:00:00.000Z'),
  };
}

export function buildTag(overrides: Partial<PredefinedTag> = {}): PredefinedTag {
  return {
    id: overrides.id ?? 'tag-1',
    key: overrides.key ?? 'anxiety',
    label: overrides.label ?? 'Тревога',
    category: overrides.category ?? null,
    isActive: overrides.isActive ?? true,
    sortOrder: overrides.sortOrder ?? 0,
    createdAt: overrides.createdAt ?? new Date('2026-03-11T08:00:00.000Z'),
  };
}

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: overrides.id ?? randomUUID(),
    telegramId: overrides.telegramId ?? BigInt(1001),
    username: overrides.username ?? 'tester',
    firstName: overrides.firstName ?? 'Test',
    languageCode: overrides.languageCode ?? 'ru',
    timezone: overrides.timezone ?? 'Europe/Berlin',
    onboardingCompleted: overrides.onboardingCompleted ?? true,
    consentGiven: overrides.consentGiven ?? true,
    remindersEnabled: overrides.remindersEnabled ?? true,
    reminderTime: overrides.reminderTime ?? '21:30',
    sleepMode: overrides.sleepMode ?? SleepMode.both,
    notesEnabled: overrides.notesEnabled ?? true,
    tagsEnabled: overrides.tagsEnabled ?? true,
    eventsEnabled: overrides.eventsEnabled ?? true,
    createdAt: overrides.createdAt ?? new Date('2026-03-11T08:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-03-11T08:00:00.000Z'),
  };
}
