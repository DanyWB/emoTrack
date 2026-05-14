import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EventType, PrismaClient, SleepMode } from '@prisma/client';

import { AdminRepository } from '../../src/admin/admin.repository';
import { CheckinsRepository } from '../../src/checkins/checkins.repository';
import { DailyMetricsRepository } from '../../src/daily-metrics/daily-metrics.repository';
import { DAILY_METRIC_CATALOG } from '../../src/daily-metrics/daily-metrics.catalog';
import type { PrismaService } from '../../src/database/prisma.service';
import { EventsRepository } from '../../src/events/events.repository';
import { UsersRepository } from '../../src/users/users.repository';

const SAFE_TEST_DATABASE_NAME_PATTERN = /test/i;
const TELEGRAM_ID_BASE = 900_000_000_000n;

function loadLocalEnvFile(): void {
  const envPath = resolve(process.cwd(), '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();

    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = normalizeEnvValue(line.slice(separatorIndex + 1).trim());
  }
}

function normalizeEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function resolveDatabaseUrlTest(): string | null {
  const value = process.env.DATABASE_URL_TEST?.trim();

  if (!value) {
    return null;
  }

  assertSafeDatabaseUrlTest(value);
  return value;
}

function assertSafeDatabaseUrlTest(databaseUrl: string): void {
  let parsed: URL;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL_TEST must be a valid PostgreSQL connection URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL_TEST must use a PostgreSQL protocol.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));

  if (!databaseName || !SAFE_TEST_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      'Refusing to run DB smoke tests: DATABASE_URL_TEST database name must contain "test".',
    );
  }
}

async function upsertMetricCatalog(prisma: PrismaClient): Promise<void> {
  for (const metric of DAILY_METRIC_CATALOG) {
    await prisma.dailyMetricDefinition.upsert({
      where: { key: metric.key },
      create: {
        key: metric.key,
        label: metric.label,
        category: metric.category,
        inputType: metric.inputType,
        defaultEnabled: metric.defaultEnabled,
        isActive: true,
        sortOrder: metric.sortOrder,
      },
      update: {
        label: metric.label,
        category: metric.category,
        inputType: metric.inputType,
        defaultEnabled: metric.defaultEnabled,
        isActive: true,
        sortOrder: metric.sortOrder,
      },
    });
  }
}

loadLocalEnvFile();

const databaseUrlTest = resolveDatabaseUrlTest();

describe('Prisma database smoke', () => {
  if (!databaseUrlTest) {
    it.skip('requires DATABASE_URL_TEST pointing to an isolated test database', () => undefined);
    return;
  }

  jest.setTimeout(30_000);

  const runId = `db-smoke-${Date.now()}`;
  let telegramIdCounter = 0n;
  let prisma: PrismaClient;
  let usersRepository: UsersRepository;
  let checkinsRepository: CheckinsRepository;
  let dailyMetricsRepository: DailyMetricsRepository;
  let eventsRepository: EventsRepository;
  let adminRepository: AdminRepository;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrlTest,
        },
      },
    });

    await prisma.$connect();
    await prisma.$executeRaw`SELECT 1`;
    await upsertMetricCatalog(prisma);

    const prismaService = prisma as unknown as PrismaService;
    usersRepository = new UsersRepository(prismaService);
    checkinsRepository = new CheckinsRepository(prismaService);
    dailyMetricsRepository = new DailyMetricsRepository(prismaService);
    eventsRepository = new EventsRepository(prismaService);
    adminRepository = new AdminRepository(prismaService);
  });

  afterEach(async () => {
    await cleanupRunUsers();
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }

    try {
      await cleanupRunUsers();
    } finally {
      await prisma.$disconnect();
    }
  });

  async function cleanupRunUsers(): Promise<void> {
    await prisma.user.deleteMany({
      where: {
        username: {
          startsWith: runId,
        },
      },
    });
  }

  async function createTestUser(label: string) {
    telegramIdCounter += 1n;

    return usersRepository.create({
      telegramId: TELEGRAM_ID_BASE + telegramIdCounter,
      username: `${runId}-${label}`,
      firstName: 'DB Smoke',
      languageCode: 'ru',
      timezone: 'Europe/Berlin',
      onboardingCompleted: true,
      consentGiven: true,
      remindersEnabled: false,
      reminderTime: '21:30',
      sleepMode: SleepMode.both,
    });
  }

  it('connects to the guarded test database and creates/reads a user', async () => {
    const user = await createTestUser('user-read');

    await expect(usersRepository.findByTelegramId(user.telegramId)).resolves.toMatchObject({
      id: user.id,
      telegramId: user.telegramId,
    });
    await expect(usersRepository.findById(user.id)).resolves.toMatchObject({
      id: user.id,
      username: `${runId}-user-read`,
    });
  });

  it('preserves the DailyEntry same-day unique upsert contract', async () => {
    const user = await createTestUser('daily-entry');
    const entryDate = new Date('2026-03-11T00:00:00.000Z');

    const first = await checkinsRepository.upsertByUserAndDate(user.id, entryDate, {
      moodScore: 4,
      energyScore: 5,
      stressScore: 6,
    });
    const second = await checkinsRepository.upsertByUserAndDate(user.id, entryDate, {
      energyScore: 8,
      noteText: 'Updated in the DB smoke test',
    });

    const rows = await prisma.dailyEntry.findMany({
      where: {
        userId: user.id,
        entryDate,
      },
    });

    expect(second.id).toBe(first.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first.id,
      moodScore: 4,
      energyScore: 8,
      stressScore: 6,
      noteText: 'Updated in the DB smoke test',
    });
  });

  it('reads the seeded metric catalog through the real repository', async () => {
    const definitions = await dailyMetricsRepository.findActiveDefinitions();
    const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));

    for (const key of ['mood', 'energy', 'stress', 'sleep', 'joy', 'wellbeing']) {
      expect(definitionsByKey.has(key)).toBe(true);
    }

    expect(definitionsByKey.get('mood')).toMatchObject({
      inputType: 'score',
      defaultEnabled: true,
    });
    expect(definitionsByKey.get('sleep')).toMatchObject({
      inputType: 'sleep_block',
      defaultEnabled: true,
    });
    expect(definitionsByKey.get('joy')).toMatchObject({
      inputType: 'score',
      defaultEnabled: false,
    });
  });

  it('reads only users eligible for reminder job reconciliation', async () => {
    const activeA = await usersRepository.update((await createTestUser('reminder-active-a')).id, {
      remindersEnabled: true,
      reminderTime: '21:15',
    });
    const disabled = await usersRepository.update((await createTestUser('reminder-disabled')).id, {
      remindersEnabled: false,
      reminderTime: '21:15',
    });
    const missingTime = await usersRepository.update((await createTestUser('reminder-missing-time')).id, {
      remindersEnabled: true,
      reminderTime: null,
    });
    const notOnboarded = await usersRepository.update((await createTestUser('reminder-not-onboarded')).id, {
      onboardingCompleted: false,
      remindersEnabled: true,
      reminderTime: '21:15',
    });
    const activeB = await usersRepository.update((await createTestUser('reminder-active-b')).id, {
      remindersEnabled: true,
      reminderTime: '08:00',
    });

    const eligibleUsers = await usersRepository.findUsersWithActiveReminders();
    const eligibleIds = eligibleUsers.map((user) => user.id);

    expect(eligibleIds).toEqual(expect.arrayContaining([activeA.id, activeB.id]));
    expect(eligibleIds).not.toContain(disabled.id);
    expect(eligibleIds).not.toContain(missingTime.id);
    expect(eligibleIds).not.toContain(notOnboarded.id);
  });

  it('reads admin overview, active users, user detail, and entry owner through real Prisma queries', async () => {
    const before = await adminRepository.getOverview();
    const user = await createTestUser('admin-active');
    const firstEntry = await checkinsRepository.upsertByUserAndDate(
      user.id,
      new Date('2026-03-13T00:00:00.000Z'),
      {
        moodScore: 7,
        energyScore: 6,
        stressScore: 3,
      },
    );
    await checkinsRepository.upsertByUserAndDate(user.id, new Date('2026-03-14T00:00:00.000Z'), {
      moodScore: 8,
      energyScore: 7,
      stressScore: 2,
    });
    await eventsRepository.create({
      userId: user.id,
      eventDate: new Date('2026-03-14T00:00:00.000Z'),
      eventType: EventType.work,
      title: 'Admin smoke event',
      eventScore: 6,
    });

    const [after, page, detail, ownerUserId] = await Promise.all([
      adminRepository.getOverview(),
      adminRepository.listActiveUsers({ offset: 0, limit: 20 }),
      adminRepository.getUserDetail(user.id),
      adminRepository.findEntryOwnerUserId(firstEntry.id),
    ]);
    const activeItem = page.items.find((item) => item.user.id === user.id);

    expect(after.totalUsers).toBeGreaterThanOrEqual(before.totalUsers + 1);
    expect(after.activeUsers).toBeGreaterThanOrEqual(before.activeUsers + 1);
    expect(after.totalCheckins).toBeGreaterThanOrEqual(before.totalCheckins + 2);
    expect(after.totalEvents).toBeGreaterThanOrEqual(before.totalEvents + 1);
    expect(activeItem).toMatchObject({
      entriesCount: 2,
      eventsCount: 1,
    });
    expect(detail).toMatchObject({
      entriesCount: 2,
      eventsCount: 1,
      summariesCount: 0,
    });
    expect(ownerUserId).toBe(user.id);
  });

  it('keeps event overlap reads inclusive and ignores legacy series rows', async () => {
    const user = await createTestUser('events');
    const singleDay = await eventsRepository.create({
      userId: user.id,
      eventDate: new Date('2026-03-12T00:00:00.000Z'),
      eventType: EventType.work,
      title: 'Single day',
      eventScore: 6,
    });
    const multiDay = await eventsRepository.create({
      userId: user.id,
      eventDate: new Date('2026-03-09T00:00:00.000Z'),
      eventEndDate: new Date('2026-03-11T00:00:00.000Z'),
      eventType: EventType.travel,
      title: 'Trip',
      eventScore: 7,
    });
    const seriesBacked = await eventsRepository.create({
      userId: user.id,
      eventDate: new Date('2026-03-10T00:00:00.000Z'),
      eventType: EventType.other,
      title: 'Legacy series row',
      eventScore: 5,
      seriesId: `${runId}-series`,
      seriesPosition: 1,
    });
    const outsidePeriod = await eventsRepository.create({
      userId: user.id,
      eventDate: new Date('2026-03-01T00:00:00.000Z'),
      eventEndDate: new Date('2026-03-02T00:00:00.000Z'),
      eventType: EventType.rest,
      title: 'Outside',
      eventScore: 4,
    });

    const dayEvents = await eventsRepository.findByUserAndDay(
      user.id,
      new Date('2026-03-10T00:00:00.000Z'),
    );
    const periodEvents = await eventsRepository.findByUserAndPeriod(
      user.id,
      new Date('2026-03-10T00:00:00.000Z'),
      new Date('2026-03-12T00:00:00.000Z'),
    );

    const dayEventIds = dayEvents.map((event) => event.id);
    const periodEventIds = periodEvents.map((event) => event.id);

    expect(dayEventIds).toContain(multiDay.id);
    expect(dayEventIds).not.toContain(singleDay.id);
    expect(dayEventIds).not.toContain(seriesBacked.id);
    expect(dayEventIds).not.toContain(outsidePeriod.id);

    expect(periodEventIds).toEqual(expect.arrayContaining([singleDay.id, multiDay.id]));
    expect(periodEventIds).not.toContain(seriesBacked.id);
    expect(periodEventIds).not.toContain(outsidePeriod.id);
  });
});
