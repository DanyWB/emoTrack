import { FSM_STATES } from '../../src/fsm/fsm.types';
import { createIntegrationTestContext, type IntegrationTestContext } from '../helpers/test-context';

describe('Onboarding flow integration', () => {
  let ctx: IntegrationTestContext;

  beforeEach(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterEach(async () => {
    await ctx.moduleRef.close();
  });

  it('creates a new user, captures consent, saves reminder time and completes onboarding', async () => {
    const user = await ctx.usersService.getOrCreateTelegramUser({
      telegramId: BigInt(5001),
      username: 'phase5-user',
      firstName: 'Phase',
      languageCode: 'ru',
    });

    const firstStep = await ctx.onboardingFlow.startOrResume(user, true);
    expect(firstStep).toEqual({
      step: 'ask_consent',
      includeIntro: true,
    });
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.onboarding_consent);

    const consentStep = await ctx.onboardingFlow.acceptConsent(user);
    expect(consentStep.step).toBe('ask_reminder_time');

    const afterConsent = await ctx.usersService.findById(user.id);
    expect(afterConsent?.consentGiven).toBe(true);
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.onboarding_reminder_time);

    const reminderStep = await ctx.onboardingFlow.submitReminderTime(afterConsent!, '21:45');
    expect(reminderStep.step).toBe('first_checkin_offer');

    const completedUser = await ctx.usersService.findById(user.id);
    expect(completedUser).toMatchObject({
      consentGiven: true,
      reminderTime: '21:45',
      onboardingCompleted: true,
    });
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.onboarding_first_checkin);

    const trackedEvents = ctx.analyticsRepository.events.map((event) => event.eventName);
    expect(trackedEvents).toEqual(
      expect.arrayContaining(['consent_given', 'reminder_time_set', 'onboarding_completed']),
    );
  });

  it('allows reminder setup to be skipped while completing onboarding', async () => {
    const user = await ctx.usersService.getOrCreateTelegramUser({
      telegramId: BigInt(5002),
      username: 'skip-reminder-user',
      firstName: 'Skip',
      languageCode: 'ru',
    });

    await ctx.usersService.setConsentGiven(user.id, true);
    const afterConsent = await ctx.usersService.findById(user.id);
    const reminderStep = await ctx.onboardingFlow.skipReminderTime(afterConsent!);

    expect(reminderStep.step).toBe('first_checkin_offer');

    const completedUser = await ctx.usersService.findById(user.id);
    expect(completedUser).toMatchObject({
      consentGiven: true,
      remindersEnabled: false,
      reminderTime: null,
      onboardingCompleted: true,
    });
    expect(await ctx.fsmService.getState(user.id)).toBe(FSM_STATES.onboarding_first_checkin);

    const trackedEvents = ctx.analyticsRepository.events.map((event) => event.eventName);
    expect(trackedEvents).toEqual(
      expect.arrayContaining(['reminder_time_skipped', 'onboarding_completed']),
    );
  });
});
