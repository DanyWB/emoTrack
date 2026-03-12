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
