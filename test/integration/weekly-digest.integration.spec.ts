import { telegramCopy } from '../../src/telegram/telegram.copy';
import { buildUser } from '../helpers/in-memory';
import { createIntegrationTestContext, type IntegrationTestContext } from '../helpers/test-context';

describe('Weekly digest integration', () => {
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
        onboardingCompleted: overrides.onboardingCompleted,
        consentGiven: overrides.consentGiven,
        reminderTime: overrides.reminderTime ?? '21:30',
        remindersEnabled: overrides.remindersEnabled,
      }),
    );
  }

  function enableTelegramDelivery() {
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    (ctx.remindersService as any).telegramEnabled = true;
    (ctx.remindersService as any).telegramApi = {
      sendMessage,
    };

    return sendMessage;
  }

  async function seedWeeklyEntries(userId: string, scores: Array<{ mood: number; energy: number; stress: number }>) {
    const today = ctx.checkinsService.buildEntryDate({ date: new Date() });

    for (let index = 0; index < scores.length; index += 1) {
      const entryDate = new Date(today.getTime() - index * 24 * 60 * 60 * 1000);
      const score = scores[index];

      await ctx.checkinsRepository.upsertByUserAndDate(userId, entryDate, {
        moodScore: score.mood,
        energyScore: score.energy,
        stressScore: score.stress,
        sleepHours: 7,
        sleepQuality: 7,
      });
    }
  }

  it('sends a weekly digest using the accepted d7 summary pipeline when the threshold is met', async () => {
    const user = await createReadyUser({
      id: 'user-weekly-1',
      telegramId: BigInt(7301),
      remindersEnabled: true,
    });
    await seedWeeklyEntries(user.id, [
      { mood: 8, energy: 7, stress: 3 },
      { mood: 7, energy: 6, stress: 4 },
      { mood: 6, energy: 5, stress: 5 },
    ]);
    const sendMessage = enableTelegramDelivery();

    await ctx.remindersService.sendWeeklyDigest(user.id);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      String(user.telegramId),
      expect.stringContaining(telegramCopy.reminders.weeklyDigestTitle),
    );
    expect(sendMessage.mock.calls[0]?.[1]).toContain('Кратко:');
    expect(sendMessage.mock.calls[0]?.[1]).toContain('Средние значения:');
    expect(ctx.analyticsRepository.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: 'summary_sent',
          userId: user.id,
        }),
      ]),
    );
  });

  it('skips the weekly digest when weekly data is below the explicit threshold', async () => {
    const user = await createReadyUser({
      id: 'user-weekly-2',
      telegramId: BigInt(7302),
      remindersEnabled: true,
    });
    await seedWeeklyEntries(user.id, [
      { mood: 8, energy: 7, stress: 3 },
      { mood: 7, energy: 6, stress: 4 },
    ]);
    const sendMessage = enableTelegramDelivery();

    await ctx.remindersService.sendWeeklyDigest(user.id);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(await ctx.remindersService.shouldSendWeeklyDigest(user.id)).toBe(false);
  });

  it('keeps weekly eligibility simple and explicit', async () => {
    const eligibleUser = await createReadyUser({
      id: 'user-weekly-3',
      telegramId: BigInt(7303),
      remindersEnabled: true,
    });
    await seedWeeklyEntries(eligibleUser.id, [
      { mood: 8, energy: 7, stress: 3 },
      { mood: 7, energy: 6, stress: 4 },
      { mood: 6, energy: 5, stress: 5 },
    ]);

    const disabledUser = await createReadyUser({
      id: 'user-weekly-4',
      telegramId: BigInt(7304),
      remindersEnabled: false,
    });
    await seedWeeklyEntries(disabledUser.id, [
      { mood: 8, energy: 7, stress: 3 },
      { mood: 7, energy: 6, stress: 4 },
      { mood: 6, energy: 5, stress: 5 },
    ]);

    const notOnboardedUser = await createReadyUser({
      id: 'user-weekly-5',
      telegramId: BigInt(7305),
      onboardingCompleted: false,
      consentGiven: false,
      remindersEnabled: true,
    });
    await seedWeeklyEntries(notOnboardedUser.id, [
      { mood: 8, energy: 7, stress: 3 },
      { mood: 7, energy: 6, stress: 4 },
      { mood: 6, energy: 5, stress: 5 },
    ]);

    expect(await ctx.remindersService.shouldSendWeeklyDigest(eligibleUser.id)).toBe(true);
    expect(await ctx.remindersService.shouldSendWeeklyDigest(disabledUser.id)).toBe(false);
    expect(await ctx.remindersService.shouldSendWeeklyDigest(notOnboardedUser.id)).toBe(false);
  });

  it('keeps weekly enqueue safe when jobs are disabled', async () => {
    const user = await createReadyUser({
      id: 'user-weekly-6',
      telegramId: BigInt(7306),
      remindersEnabled: true,
    });

    await expect(ctx.remindersService.enqueueWeeklySummary(user.id)).resolves.toBeUndefined();
    expect(ctx.analyticsRepository.events).toEqual([]);
  });
});
