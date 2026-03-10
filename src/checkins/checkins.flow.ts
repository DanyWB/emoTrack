import { Injectable } from '@nestjs/common';
import { type User } from '@prisma/client';

import { AnalyticsService } from '../analytics/analytics.service';
import { parseIntegerScore, parseSleepHours } from '../common/utils/validation.utils';
import { FsmService } from '../fsm/fsm.service';
import { FSM_STATES, type CheckinDraftPayload, type FsmState } from '../fsm/fsm.types';
import { CheckinsService } from './checkins.service';
import type { UpsertDailyEntryDto } from './dto/upsert-daily-entry.dto';

export type CheckinFlowStatus =
  | 'next'
  | 'saved'
  | 'invalid_score'
  | 'invalid_sleep_hours'
  | 'cannot_back'
  | 'not_in_checkin';

export interface CheckinFlowResult {
  status: CheckinFlowStatus;
  nextState?: FsmState;
  isUpdate?: boolean;
  entryPayload?: UpsertDailyEntryDto;
}

@Injectable()
export class CheckinsFlowService {
  constructor(
    private readonly checkinsService: CheckinsService,
    private readonly fsmService: FsmService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async start(user: User): Promise<CheckinFlowResult> {
    await this.fsmService.setState(user.id, FSM_STATES.checkin_mood, {});
    await this.analyticsService.track('checkin_started', {}, user.id);

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_mood,
    };
  }

  async submitScore(user: User, value: string | number): Promise<CheckinFlowResult> {
    const score = typeof value === 'number' ? value : parseIntegerScore(value);

    if (score === null) {
      return { status: 'invalid_score' };
    }

    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    switch (state) {
      case FSM_STATES.checkin_mood: {
        await this.fsmService.setState(user.id, FSM_STATES.checkin_energy, {
          ...payload,
          moodScore: score,
        });
        return { status: 'next', nextState: FSM_STATES.checkin_energy };
      }
      case FSM_STATES.checkin_energy: {
        await this.fsmService.setState(user.id, FSM_STATES.checkin_stress, {
          ...payload,
          energyScore: score,
        });
        return { status: 'next', nextState: FSM_STATES.checkin_stress };
      }
      case FSM_STATES.checkin_stress: {
        const nextPayload: CheckinDraftPayload = {
          ...payload,
          stressScore: score,
        };

        if (user.sleepMode === 'hours' || user.sleepMode === 'both') {
          await this.fsmService.setState(user.id, FSM_STATES.checkin_sleep_hours, nextPayload);
          return { status: 'next', nextState: FSM_STATES.checkin_sleep_hours };
        }

        await this.fsmService.setState(user.id, FSM_STATES.checkin_sleep_quality, nextPayload);
        return { status: 'next', nextState: FSM_STATES.checkin_sleep_quality };
      }
      case FSM_STATES.checkin_sleep_quality: {
        return this.finalizeCheckin(user, {
          ...payload,
          sleepQuality: score,
        });
      }
      default:
        return { status: 'not_in_checkin' };
    }
  }

  async submitSleepHours(user: User, rawValue: string): Promise<CheckinFlowResult> {
    const parsed = parseSleepHours(rawValue);

    if (parsed === null) {
      return { status: 'invalid_sleep_hours' };
    }

    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (state !== FSM_STATES.checkin_sleep_hours) {
      return { status: 'not_in_checkin' };
    }

    if (user.sleepMode === 'both') {
      await this.fsmService.setState(user.id, FSM_STATES.checkin_sleep_quality, {
        ...payload,
        sleepHours: parsed,
      });
      return {
        status: 'next',
        nextState: FSM_STATES.checkin_sleep_quality,
      };
    }

    return this.finalizeCheckin(user, {
      ...payload,
      sleepHours: parsed,
    });
  }

  async skipCurrentStep(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (state === FSM_STATES.checkin_sleep_hours) {
      if (user.sleepMode === 'both') {
        const nextPayload = this.withoutKeys(payload, ['sleepHours']);
        await this.fsmService.setState(user.id, FSM_STATES.checkin_sleep_quality, nextPayload);
        return {
          status: 'next',
          nextState: FSM_STATES.checkin_sleep_quality,
        };
      }

      const nextPayload = this.withoutKeys(payload, ['sleepHours']);
      return this.finalizeCheckin(user, nextPayload);
    }

    if (state === FSM_STATES.checkin_sleep_quality) {
      const nextPayload = this.withoutKeys(payload, ['sleepQuality']);
      return this.finalizeCheckin(user, nextPayload);
    }

    return { status: 'not_in_checkin' };
  }

  async goBack(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    switch (state) {
      case FSM_STATES.checkin_mood:
        return { status: 'cannot_back' };
      case FSM_STATES.checkin_energy: {
        await this.fsmService.setState(
          user.id,
          FSM_STATES.checkin_mood,
          this.withoutKeys(payload, ['energyScore', 'stressScore', 'sleepHours', 'sleepQuality']),
        );
        return { status: 'next', nextState: FSM_STATES.checkin_mood };
      }
      case FSM_STATES.checkin_stress: {
        await this.fsmService.setState(
          user.id,
          FSM_STATES.checkin_energy,
          this.withoutKeys(payload, ['stressScore', 'sleepHours', 'sleepQuality']),
        );
        return { status: 'next', nextState: FSM_STATES.checkin_energy };
      }
      case FSM_STATES.checkin_sleep_hours: {
        await this.fsmService.setState(
          user.id,
          FSM_STATES.checkin_stress,
          this.withoutKeys(payload, ['sleepHours', 'sleepQuality']),
        );
        return { status: 'next', nextState: FSM_STATES.checkin_stress };
      }
      case FSM_STATES.checkin_sleep_quality: {
        if (user.sleepMode === 'both') {
          await this.fsmService.setState(
            user.id,
            FSM_STATES.checkin_sleep_hours,
            this.withoutKeys(payload, ['sleepQuality']),
          );
          return { status: 'next', nextState: FSM_STATES.checkin_sleep_hours };
        }

        await this.fsmService.setState(
          user.id,
          FSM_STATES.checkin_stress,
          this.withoutKeys(payload, ['sleepQuality']),
        );
        return { status: 'next', nextState: FSM_STATES.checkin_stress };
      }
      default:
        return { status: 'not_in_checkin' };
    }
  }

  async cancel(userId: string): Promise<void> {
    await this.fsmService.clearSession(userId);
  }

  private async finalizeCheckin(user: User, payload: CheckinDraftPayload): Promise<CheckinFlowResult> {
    if (
      typeof payload.moodScore !== 'number' ||
      typeof payload.energyScore !== 'number' ||
      typeof payload.stressScore !== 'number'
    ) {
      await this.fsmService.setState(user.id, FSM_STATES.checkin_mood, {});
      return { status: 'next', nextState: FSM_STATES.checkin_mood };
    }

    const entryPayload: UpsertDailyEntryDto = {
      moodScore: payload.moodScore,
      energyScore: payload.energyScore,
      stressScore: payload.stressScore,
      sleepHours: payload.sleepHours,
      sleepQuality: payload.sleepQuality,
    };

    const result = await this.checkinsService.upsertTodayEntry(user.id, entryPayload, {
      timezone: user.timezone,
    });

    await this.fsmService.setIdle(user.id);
    await this.analyticsService.track(
      result.isUpdate ? 'checkin_updated' : 'checkin_completed',
      { entryId: result.entry.id },
      user.id,
    );

    return {
      status: 'saved',
      isUpdate: result.isUpdate,
      entryPayload,
    };
  }

  private extractPayload(payload: unknown): CheckinDraftPayload {
    if (!payload || typeof payload !== 'object') {
      return {};
    }

    return payload as CheckinDraftPayload;
  }

  private withoutKeys(payload: CheckinDraftPayload, keys: Array<keyof CheckinDraftPayload>): CheckinDraftPayload {
    const next = { ...payload };

    for (const key of keys) {
      delete next[key];
    }

    return next;
  }
}
