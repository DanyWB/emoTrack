import { type SleepMode, type User } from '@prisma/client';

import { FSM_STATES, type CheckinDraftPayload, type FsmState } from '../fsm/fsm.types';

export type CoreCheckinState =
  | typeof FSM_STATES.checkin_mood
  | typeof FSM_STATES.checkin_energy
  | typeof FSM_STATES.checkin_stress
  | typeof FSM_STATES.checkin_sleep_hours
  | typeof FSM_STATES.checkin_sleep_quality;

export type CoreCheckinPayloadKey =
  | 'moodScore'
  | 'energyScore'
  | 'stressScore'
  | 'sleepHours'
  | 'sleepQuality';

export type CheckinStepConfig = Pick<
  User,
  'trackMood' | 'trackEnergy' | 'trackStress' | 'trackSleep' | 'sleepMode'
>;

export function buildCoreCheckinStates(config: CheckinStepConfig): CoreCheckinState[] {
  const states: CoreCheckinState[] = [];

  if (config.trackMood) {
    states.push(FSM_STATES.checkin_mood);
  }

  if (config.trackEnergy) {
    states.push(FSM_STATES.checkin_energy);
  }

  if (config.trackStress) {
    states.push(FSM_STATES.checkin_stress);
  }

  if (config.trackSleep) {
    states.push(...buildSleepStates(config.sleepMode));
  }

  return states;
}

export function getNextCoreCheckinState(
  config: CheckinStepConfig,
  state: CoreCheckinState,
): CoreCheckinState | null {
  const states = buildCoreCheckinStates(config);
  const currentIndex = states.indexOf(state);

  if (currentIndex === -1 || currentIndex >= states.length - 1) {
    return null;
  }

  return states[currentIndex + 1];
}

export function getPreviousCoreCheckinState(
  config: CheckinStepConfig,
  state: CoreCheckinState,
): CoreCheckinState | null {
  const states = buildCoreCheckinStates(config);
  const currentIndex = states.indexOf(state);

  if (currentIndex <= 0) {
    return null;
  }

  return states[currentIndex - 1];
}

export function getCoreCheckinStepPosition(
  config: CheckinStepConfig,
  state: CoreCheckinState,
): { stepNumber: number; totalSteps: number } | null {
  const states = buildCoreCheckinStates(config);
  const currentIndex = states.indexOf(state);

  if (currentIndex === -1) {
    return null;
  }

  return {
    stepNumber: currentIndex + 1,
    totalSteps: states.length,
  };
}

export function isCoreCheckinState(state: FsmState): state is CoreCheckinState {
  return (
    state === FSM_STATES.checkin_mood ||
    state === FSM_STATES.checkin_energy ||
    state === FSM_STATES.checkin_stress ||
    state === FSM_STATES.checkin_sleep_hours ||
    state === FSM_STATES.checkin_sleep_quality
  );
}

export function mapCoreStateToPayloadKey(state: CoreCheckinState): CoreCheckinPayloadKey {
  switch (state) {
    case FSM_STATES.checkin_mood:
      return 'moodScore';
    case FSM_STATES.checkin_energy:
      return 'energyScore';
    case FSM_STATES.checkin_stress:
      return 'stressScore';
    case FSM_STATES.checkin_sleep_hours:
      return 'sleepHours';
    case FSM_STATES.checkin_sleep_quality:
      return 'sleepQuality';
  }
}

export function hasCapturedCoreMetric(payload: CheckinDraftPayload): boolean {
  return (
    typeof payload.moodScore === 'number' ||
    typeof payload.energyScore === 'number' ||
    typeof payload.stressScore === 'number' ||
    typeof payload.sleepHours === 'number' ||
    typeof payload.sleepQuality === 'number'
  );
}

function buildSleepStates(sleepMode: SleepMode): CoreCheckinState[] {
  if (sleepMode === 'hours') {
    return [FSM_STATES.checkin_sleep_hours];
  }

  if (sleepMode === 'quality') {
    return [FSM_STATES.checkin_sleep_quality];
  }

  return [FSM_STATES.checkin_sleep_hours, FSM_STATES.checkin_sleep_quality];
}
