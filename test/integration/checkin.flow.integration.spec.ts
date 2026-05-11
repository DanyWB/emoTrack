import { SleepMode } from '@prisma/client';

import { FSM_STATES } from '../../src/fsm/fsm.types';
import { buildUser } from '../helpers/in-memory';
import { createIntegrationTestContext, type IntegrationTestContext } from '../helpers/test-context';

describe('Check-in flow integration', () => {
  let ctx: IntegrationTestContext;

  beforeEach(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterEach(async () => {
    await ctx.moduleRef.close();
  });

  async function createReadyUser(overrides: Partial<ReturnType<typeof buildUser>> = {}) {
    return ctx.usersRepository.create(
      buildUser({
        id: overrides.id,
        telegramId: overrides.telegramId,
        timezone: 'Europe/Berlin',
        onboardingCompleted: true,
        consentGiven: true,
        reminderTime: '21:30',
        sleepMode: overrides.sleepMode ?? SleepMode.both,
        trackMood: overrides.trackMood,
        trackEnergy: overrides.trackEnergy,
        trackStress: overrides.trackStress,
        trackSleep: overrides.trackSleep,
      }),
    );
  }

  async function completeCoreCheckin(
    userId: string,
    moodScore: string,
    energyScore: string,
    stressScore: string,
    sleepHours: string,
    sleepQuality: string,
  ) {
    const user = await ctx.usersService.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await ctx.checkinsFlow.start(user);
    await ctx.checkinsFlow.submitScore(user, moodScore);
    await ctx.checkinsFlow.submitScore(user, energyScore);
    await ctx.checkinsFlow.submitScore(user, stressScore);
    await ctx.checkinsFlow.submitSleepHours(user, sleepHours);
    await ctx.checkinsFlow.submitScore(user, sleepQuality);
    await ctx.checkinsFlow.skipCurrentStep(user);
    await ctx.checkinsFlow.skipCurrentStep(user);

    return ctx.checkinsFlow.skipCurrentStep(user);
  }

  function listMetricValuesByKey(entryId: string) {
    const definitionsById = new Map(
      ctx.dailyMetricsRepository.listDefinitions().map((definition) => [definition.id, definition.key] as const),
    );

    return Object.fromEntries(
      ctx.checkinsRepository
        .listMetricValuesForEntry(entryId)
        .map((metricValue) => [definitionsById.get(metricValue.metricDefinitionId), metricValue.value])
        .filter((entry): entry is [string, number] => typeof entry[0] === 'string'),
    );
  }

  it('persists mood, energy, stress and sleep through the core check-in flow', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-1',
      telegramId: BigInt(6001),
    });

    const result = await completeCoreCheckin(user.id, '7', '6', '4', '7.5', '8');

    expect(result.status).toBe('saved');
    expect(result.entryPayload).toMatchObject({
      moodScore: 7,
      energyScore: 6,
      stressScore: 4,
      sleepHours: 7.5,
      sleepQuality: 8,
    });
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.idle);

    const entries = ctx.checkinsRepository.listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: user.id,
      moodScore: 7,
      energyScore: 6,
      stressScore: 4,
      sleepQuality: 8,
    });
  });

  it('builds a partial entry when only selected daily metrics are enabled', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-1b',
      telegramId: BigInt(6011),
      trackMood: true,
      trackEnergy: false,
      trackStress: true,
      trackSleep: false,
    });

    const started = await ctx.checkinsFlow.start(user);
    expect(started).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_mood,
    });

    const moodStep = await ctx.checkinsFlow.submitScore(user, '8');
    expect(moodStep).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_stress,
    });

    await ctx.checkinsFlow.submitScore(user, '2');
    await ctx.checkinsFlow.skipCurrentStep(user);
    await ctx.checkinsFlow.skipCurrentStep(user);
    const finalResult = await ctx.checkinsFlow.skipCurrentStep(user);

    expect(finalResult).toMatchObject({
      status: 'saved',
      entryPayload: {
        moodScore: 8,
        stressScore: 2,
      },
    });
    expect(finalResult.entryPayload?.energyScore).toBeUndefined();
    expect(finalResult.entryPayload?.sleepHours).toBeUndefined();

    const [entry] = ctx.checkinsRepository.listEntries();
    expect(entry).toMatchObject({
      userId: user.id,
      moodScore: 8,
      energyScore: null,
      stressScore: 2,
      sleepHours: null,
      sleepQuality: null,
    });
  });

  it('persists enabled extra metrics alongside legacy core values', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-1c',
      telegramId: BigInt(6014),
      trackMood: true,
      trackEnergy: false,
      trackStress: false,
      trackSleep: false,
    });

    await ctx.usersService.setTrackedMetric(user.id, 'joy', true);
    const updatedUser = await ctx.usersService.findById(user.id);

    if (!updatedUser) {
      throw new Error('User not found');
    }

    const started = await ctx.checkinsFlow.start(updatedUser);
    expect(started).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_mood,
    });

    const nextStep = await ctx.checkinsFlow.submitScore(updatedUser, '7');
    expect(nextStep).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_metric_score,
    });

    await ctx.checkinsFlow.submitScore(updatedUser, '9');
    await ctx.checkinsFlow.skipCurrentStep(updatedUser);
    await ctx.checkinsFlow.skipCurrentStep(updatedUser);
    const result = await ctx.checkinsFlow.skipCurrentStep(updatedUser);

    const [entry] = ctx.checkinsRepository.listEntries();
    const metricValues = listMetricValuesByKey(entry.id);

    expect(result).toMatchObject({
      status: 'saved',
      entryPayload: {
        moodScore: 7,
        metricValues: expect.arrayContaining([
          expect.objectContaining({ key: 'mood', value: 7 }),
          expect.objectContaining({ key: 'joy', value: 9 }),
        ]),
      },
    });
    expect(entry).toMatchObject({
      moodScore: 7,
      energyScore: null,
      stressScore: null,
      sleepHours: null,
      sleepQuality: null,
    });
    expect(metricValues).toMatchObject({
      mood: 7,
      joy: 9,
    });
  });

  it('updates the same DailyEntry on a repeated same-day check-in', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-2',
      telegramId: BigInt(6002),
    });

    const firstResult = await completeCoreCheckin(user.id, '5', '5', '6', '7', '6');
    const firstEntryId = ctx.checkinsRepository.listEntries()[0]?.id;

    const secondResult = await completeCoreCheckin(user.id, '8', '7', '3', '8', '8');
    const entries = ctx.checkinsRepository.listEntries();

    expect(firstResult.status).toBe('saved');
    expect(secondResult.status).toBe('saved');
    expect(secondResult.isUpdate).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: firstEntryId,
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
      sleepQuality: 8,
    });
  });

  it('keeps untracked same-day values untouched on a later partial check-in', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-2b',
      telegramId: BigInt(6012),
      trackMood: true,
      trackEnergy: true,
      trackStress: true,
      trackSleep: true,
    });

    await completeCoreCheckin(user.id, '5', '6', '4', '7', '6');
    await ctx.usersService.updateSettings(user.id, {
      trackMood: true,
      trackEnergy: false,
      trackStress: false,
      trackSleep: false,
    });

    const updatedUser = await ctx.usersService.findById(user.id);
    if (!updatedUser) {
      throw new Error('User not found');
    }

    await ctx.checkinsFlow.start(updatedUser);
    await ctx.checkinsFlow.submitScore(updatedUser, '9');
    await ctx.checkinsFlow.skipCurrentStep(updatedUser);
    await ctx.checkinsFlow.skipCurrentStep(updatedUser);
    const result = await ctx.checkinsFlow.skipCurrentStep(updatedUser);

    const [entry] = ctx.checkinsRepository.listEntries();

    expect(result).toMatchObject({
      status: 'saved',
      isUpdate: true,
      entryPayload: {
        moodScore: 9,
      },
    });
    expect(entry).toMatchObject({
      moodScore: 9,
      energyScore: 6,
      stressScore: 4,
      sleepQuality: 6,
    });
    expect(entry.sleepHours?.toString()).toBe('7');
  });

  it('keeps untouched generic metric values on a later same-day rerun', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-2d',
      telegramId: BigInt(6015),
      trackMood: true,
      trackEnergy: false,
      trackStress: false,
      trackSleep: false,
    });

    await ctx.usersService.setTrackedMetric(user.id, 'joy', true);
    const firstUser = await ctx.usersService.findById(user.id);

    if (!firstUser) {
      throw new Error('User not found');
    }

    await ctx.checkinsFlow.start(firstUser);
    await ctx.checkinsFlow.submitScore(firstUser, '5');
    await ctx.checkinsFlow.submitScore(firstUser, '8');
    await ctx.checkinsFlow.skipCurrentStep(firstUser);
    await ctx.checkinsFlow.skipCurrentStep(firstUser);
    await ctx.checkinsFlow.skipCurrentStep(firstUser);

    await ctx.usersService.setTrackedMetric(user.id, 'joy', false);
    const secondUser = await ctx.usersService.findById(user.id);

    if (!secondUser) {
      throw new Error('User not found');
    }

    await ctx.checkinsFlow.start(secondUser);
    await ctx.checkinsFlow.submitScore(secondUser, '9');
    await ctx.checkinsFlow.skipCurrentStep(secondUser);
    await ctx.checkinsFlow.skipCurrentStep(secondUser);
    const result = await ctx.checkinsFlow.skipCurrentStep(secondUser);

    const [entry] = ctx.checkinsRepository.listEntries();
    const metricValues = listMetricValuesByKey(entry.id);

    expect(result).toMatchObject({
      status: 'saved',
      isUpdate: true,
      entryPayload: {
        moodScore: 9,
        metricValues: expect.arrayContaining([expect.objectContaining({ key: 'mood', value: 9 })]),
      },
    });
    expect(metricValues).toMatchObject({
      mood: 9,
      joy: 8,
    });
  });

  it('does not allow skipping the last remaining tracked metric', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-2c',
      telegramId: BigInt(6013),
      sleepMode: SleepMode.hours,
      trackMood: false,
      trackEnergy: false,
      trackStress: false,
      trackSleep: true,
    });

    const started = await ctx.checkinsFlow.start(user);
    const skipped = await ctx.checkinsFlow.skipCurrentStep(user);

    expect(started).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_sleep_hours,
    });
    expect(skipped).toMatchObject({
      status: 'cannot_skip',
    });
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.checkin_sleep_hours);
    expect(ctx.checkinsRepository.listEntries()).toHaveLength(0);
  });

  it('does not report draft tag selections as saved when the tag step is skipped', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-2e',
      telegramId: BigInt(6016),
    });

    await ctx.checkinsFlow.start(user);
    await ctx.checkinsFlow.submitScore(user, '7');
    await ctx.checkinsFlow.submitScore(user, '6');
    await ctx.checkinsFlow.submitScore(user, '4');
    await ctx.checkinsFlow.submitSleepHours(user, '7.5');
    await ctx.checkinsFlow.submitScore(user, '8');
    await ctx.checkinsFlow.skipCurrentStep(user);
    await ctx.checkinsFlow.startTagsSelection(user);
    await ctx.checkinsFlow.toggleTagSelection(user, 'tag-1');

    const skippedTags = await ctx.checkinsFlow.skipCurrentStep(user);
    const finalResult = await ctx.checkinsFlow.skipCurrentStep(user);
    const savedEntry = ctx.checkinsRepository.listEntries()[0];

    expect(skippedTags).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_add_event_confirm,
    });
    expect(finalResult).toMatchObject({
      status: 'saved',
      tagsCount: 0,
    });
    expect(ctx.checkinsRepository.getTagIdsForEntry(savedEntry.id)).toEqual([]);
  });

  it('resumes an active check-in and preserves saved optional markers after going back', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-3',
      telegramId: BigInt(6003),
    });

    await ctx.checkinsFlow.start(user);
    await ctx.checkinsFlow.submitScore(user, '7');
    await ctx.checkinsFlow.submitScore(user, '6');

    const resumed = await ctx.checkinsFlow.start(user);
    expect(resumed).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_stress,
      resumed: true,
    });

    await ctx.checkinsFlow.submitScore(user, '4');
    await ctx.checkinsFlow.submitSleepHours(user, '7.5');
    await ctx.checkinsFlow.submitScore(user, '8');

    await ctx.checkinsFlow.beginNoteStep(user);
    await ctx.checkinsFlow.submitNote(user, 'Был насыщенный день');
    await ctx.checkinsFlow.startTagsSelection(user);
    await ctx.checkinsFlow.toggleTagSelection(user, 'tag-1');
    await ctx.checkinsFlow.confirmTags(user);

    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.checkin_add_event_confirm);

    await ctx.checkinsFlow.goBack(user);
    await ctx.checkinsFlow.goBack(user);
    const backToSleep = await ctx.checkinsFlow.goBack(user);

    expect(backToSleep).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_sleep_quality,
    });

    const repersisted = await ctx.checkinsFlow.submitScore(user, '9');
    expect(repersisted).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_note_prompt,
    });

    await ctx.checkinsFlow.skipCurrentStep(user);
    await ctx.checkinsFlow.skipCurrentStep(user);
    const finalResult = await ctx.checkinsFlow.skipCurrentStep(user);

    const savedEntry = ctx.checkinsRepository.listEntries()[0];

    expect(finalResult).toMatchObject({
      status: 'saved',
      isUpdate: true,
      noteAdded: true,
      tagsCount: 1,
      eventAdded: false,
      entryPayload: {
        moodScore: 7,
        energyScore: 6,
        stressScore: 4,
        sleepHours: 7.5,
        sleepQuality: 9,
        noteText: 'Был насыщенный день',
      },
    });
    expect(savedEntry.noteText).toBe('Был насыщенный день');
    expect(ctx.checkinsRepository.getTagIdsForEntry(savedEntry.id)).toEqual(['tag-1']);
  });
});
