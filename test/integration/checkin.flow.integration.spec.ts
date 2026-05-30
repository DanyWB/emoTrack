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
        checkinV2OnboardingCompleted: true,
        reminderTime: '21:30',
        sleepMode: overrides.sleepMode ?? SleepMode.both,
        trackSleep: overrides.trackSleep,
      }),
    );
  }

  async function submitMetric(user: Awaited<ReturnType<typeof createReadyUser>>, score: string, tagKeys: string[] = []) {
    const scored = await ctx.checkinsFlow.submitScore(user, score);
    expect(scored).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_metric_tags,
    });

    for (const tagKey of tagKeys) {
      const toggled = await ctx.checkinsFlow.toggleMetricTagSelection(user, tagKey);
      expect(toggled.status).toBe('next');
    }

    return ctx.checkinsFlow.confirmMetricTags(user);
  }

  async function completeDefaultMetrics(
    user: Awaited<ReturnType<typeof createReadyUser>>,
    scores: [string, string, string, string, string] = ['4', '3', '2', '3', '2'],
  ) {
    const started = await ctx.checkinsFlow.start(user);
    expect(started).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_metric_score,
    });

    await submitMetric(user, scores[0], ['mood_calm']);
    await submitMetric(user, scores[1], ['energy_sleepy']);
    await submitMetric(user, scores[2], ['calm_anxious']);
    await submitMetric(user, scores[3]);
    return submitMetric(user, scores[4]);
  }

  function listV2MetricValuesByKey(entryId: string) {
    return Object.fromEntries(
      ctx.checkinsRepository
        .listV2MetricValuesForEntry(entryId)
        .map((metricValue) => [
          metricValue.metricKey,
          {
            ordinalValue: metricValue.ordinalValue,
            tagKeys: metricValue.tags.map((tag) => tag.tagKey),
          },
        ]),
    );
  }

  async function finishAfterReview(user: Awaited<ReturnType<typeof createReadyUser>>) {
    const savedToEntry = await ctx.checkinsFlow.confirmReview(user);
    expect(savedToEntry).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_add_event_confirm,
    });

    const notePrompt = await ctx.checkinsFlow.finalizeAfterEventSkip(user);
    expect(notePrompt).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_note_prompt,
    });

    return ctx.checkinsFlow.skipCurrentStep(user);
  }

  it('persists semantic v2 metrics, scoped tags, and sleep from the default check-in', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-v2-1',
      telegramId: BigInt(6001),
    });

    const afterMetrics = await completeDefaultMetrics(user);
    expect(afterMetrics).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_sleep_hours,
    });

    expect(await ctx.checkinsFlow.submitSleepHours(user, '7.5')).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_sleep_quality,
    });
    expect(await ctx.checkinsFlow.submitScore(user, '4')).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_review,
    });

    const finalResult = await finishAfterReview(user);

    expect(finalResult).toMatchObject({
      status: 'saved',
      noteAdded: false,
      tagsCount: 3,
      eventAdded: false,
      entryPayload: {
        sleepHours: 7.5,
        sleepQuality: 4,
        v2MetricValues: expect.arrayContaining([
          expect.objectContaining({ key: 'mood', ordinalValue: 4, tagKeys: ['mood_calm'] }),
          expect.objectContaining({ key: 'energy', ordinalValue: 3, tagKeys: ['energy_sleepy'] }),
          expect.objectContaining({ key: 'calm', ordinalValue: 2, tagKeys: ['calm_anxious'] }),
          expect.objectContaining({ key: 'motivation', ordinalValue: 3, tagKeys: [] }),
          expect.objectContaining({ key: 'overall_state', ordinalValue: 2, tagKeys: [] }),
        ]),
      },
    });
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.idle);

    const entries = ctx.checkinsRepository.listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: user.id,
      moodScore: null,
      energyScore: null,
      stressScore: null,
      sleepQuality: 4,
    });
    expect(listV2MetricValuesByKey(entries[0].id)).toMatchObject({
      mood: { ordinalValue: 4, tagKeys: ['mood_calm'] },
      energy: { ordinalValue: 3, tagKeys: ['energy_sleepy'] },
      calm: { ordinalValue: 2, tagKeys: ['calm_anxious'] },
      motivation: { ordinalValue: 3, tagKeys: [] },
      overall_state: { ordinalValue: 2, tagKeys: [] },
    });
  });

  it('skips the separate sleep block when sleep tracking is disabled', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-v2-2',
      telegramId: BigInt(6002),
      trackSleep: false,
    });

    const afterMetrics = await completeDefaultMetrics(user);
    expect(afterMetrics).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_review,
    });

    const finalResult = await finishAfterReview(user);
    const [entry] = ctx.checkinsRepository.listEntries();

    expect(finalResult).toMatchObject({
      status: 'saved',
      entryPayload: {
        sleepHours: undefined,
        sleepQuality: undefined,
      },
    });
    expect(entry).toMatchObject({
      sleepHours: null,
      sleepQuality: null,
    });
  });

  it('updates the same DailyEntry and replaces metric tags on a repeated same-day check-in', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-v2-3',
      telegramId: BigInt(6003),
      trackSleep: false,
    });

    await completeDefaultMetrics(user, ['3', '3', '3', '3', '3']);
    const firstResult = await finishAfterReview(user);
    const firstEntryId = ctx.checkinsRepository.listEntries()[0]?.id;

    await completeDefaultMetrics(user, ['5', '4', '4', '4', '4']);
    const secondResult = await finishAfterReview(user);
    const entries = ctx.checkinsRepository.listEntries();

    expect(firstResult.status).toBe('saved');
    expect(secondResult).toMatchObject({
      status: 'saved',
      isUpdate: true,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(firstEntryId);
    expect(listV2MetricValuesByKey(entries[0].id)).toMatchObject({
      mood: { ordinalValue: 5, tagKeys: ['mood_calm'] },
      energy: { ordinalValue: 4, tagKeys: ['energy_sleepy'] },
      calm: { ordinalValue: 4, tagKeys: ['calm_anxious'] },
    });
  });

  it('removes stale optional metric rows when the active check-in set changes', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-v2-stale',
      telegramId: BigInt(6013),
      trackSleep: false,
    });

    await completeDefaultMetrics(user, ['3', '3', '3', '3', '3']);
    await finishAfterReview(user);

    await ctx.usersService.setTrackedMetric(user.id, 'motivation', false);
    await ctx.usersService.setTrackedMetric(user.id, 'overall_state', false);

    expect(await ctx.checkinsFlow.start(user)).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_metric_score,
    });
    await submitMetric(user, '5', ['mood_calm']);
    await submitMetric(user, '4', ['energy_even']);
    await submitMetric(user, '5', ['calm_relaxed']);
    await finishAfterReview(user);

    const [entry] = ctx.checkinsRepository.listEntries();
    expect(Object.keys(listV2MetricValuesByKey(entry.id)).sort()).toEqual(['calm', 'energy', 'mood']);
  });

  it('lets the review screen edit a specific metric before saving', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-v2-4',
      telegramId: BigInt(6004),
      trackSleep: false,
    });

    await completeDefaultMetrics(user, ['3', '3', '2', '3', '3']);
    expect(await ctx.checkinsFlow.startReviewEdit(user)).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_review_edit,
    });
    expect(await ctx.checkinsFlow.editReviewMetric(user, 'calm')).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_metric_score,
    });
    await submitMetric(user, '5', ['calm_relaxed']);

    const finalResult = await finishAfterReview(user);
    const [entry] = ctx.checkinsRepository.listEntries();

    expect(finalResult.status).toBe('saved');
    expect(listV2MetricValuesByKey(entry.id)).toMatchObject({
      calm: { ordinalValue: 5, tagKeys: ['calm_relaxed'] },
    });
  });

  it('resumes an active v2 check-in at the current metric tags screen', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-v2-5',
      telegramId: BigInt(6005),
    });

    await ctx.checkinsFlow.start(user);
    await ctx.checkinsFlow.submitScore(user, '4');
    await ctx.checkinsFlow.toggleMetricTagSelection(user, 'mood_calm');

    const resumed = await ctx.checkinsFlow.start(user);

    expect(resumed).toMatchObject({
      status: 'next',
      nextState: FSM_STATES.checkin_metric_tags,
      resumed: true,
      selectedTagKeys: ['mood_calm'],
    });
  });

  it('allows up to three scoped tags per metric and rejects the fourth tag', async () => {
    const user = await createReadyUser({
      id: 'user-checkin-v2-tag-limit',
      telegramId: BigInt(6014),
    });

    await ctx.checkinsFlow.start(user);
    await ctx.checkinsFlow.submitScore(user, '4');

    expect(await ctx.checkinsFlow.toggleMetricTagSelection(user, 'mood_calm')).toMatchObject({
      status: 'next',
      selectedTagKeys: ['mood_calm'],
    });
    expect(await ctx.checkinsFlow.toggleMetricTagSelection(user, 'mood_light')).toMatchObject({
      status: 'next',
      selectedTagKeys: ['mood_calm', 'mood_light'],
    });
    expect(await ctx.checkinsFlow.toggleMetricTagSelection(user, 'mood_inspired')).toMatchObject({
      status: 'next',
      selectedTagKeys: ['mood_calm', 'mood_light', 'mood_inspired'],
    });

    expect(await ctx.checkinsFlow.toggleMetricTagSelection(user, 'mood_playful')).toMatchObject({
      status: 'too_many_metric_tags',
      selectedTagKeys: ['mood_calm', 'mood_light', 'mood_inspired'],
    });
  });
});
