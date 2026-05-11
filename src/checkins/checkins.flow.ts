import { Injectable } from '@nestjs/common';
import { type User } from '@prisma/client';

import { AnalyticsService } from '../analytics/analytics.service';
import { formatDateKey } from '../common/utils/date.utils';
import { DailyMetricsService } from '../daily-metrics/daily-metrics.service';
import { FsmService } from '../fsm/fsm.service';
import { FSM_STATES, type CheckinDraftPayload, type FsmState } from '../fsm/fsm.types';
import { TagsService } from '../tags/tags.service';
import { parseIntegerScore, parseSleepHours } from '../common/utils/validation.utils';
import { CheckinsService } from './checkins.service';
import type { DailyMetricValueInput, UpsertDailyEntryDto } from './dto/upsert-daily-entry.dto';
import {
  buildCoreCheckinStates,
  getNextCoreCheckinState,
  getPreviousCoreCheckinState,
  hasCapturedCoreMetric,
  isCoreCheckinState,
  mapCoreStateToPayloadKey,
  type CoreCheckinState,
} from './checkins.steps';

export type CheckinFlowStatus =
  | 'next'
  | 'saved'
  | 'invalid_score'
  | 'invalid_sleep_hours'
  | 'invalid_note'
  | 'invalid_tag'
  | 'cannot_back'
  | 'cannot_skip'
  | 'not_in_checkin'
  | 'missing_context';

export interface CheckinFlowResult {
  status: CheckinFlowStatus;
  nextState?: FsmState;
  isUpdate?: boolean;
  entryPayload?: UpsertDailyEntryDto;
  selectedTagIds?: string[];
  noteAdded?: boolean;
  tagsCount?: number;
  eventAdded?: boolean;
  resumed?: boolean;
}

interface CheckinStepTarget {
  state: FsmState;
  activeMetricKey?: string;
}

@Injectable()
export class CheckinsFlowService {
  constructor(
    private readonly checkinsService: CheckinsService,
    private readonly dailyMetricsService: DailyMetricsService,
    private readonly tagsService: TagsService,
    private readonly fsmService: FsmService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async start(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (this.isCheckinState(state) || this.isCheckinEventState(state, payload)) {
      return {
        status: 'next',
        nextState: state,
        selectedTagIds: payload.selectedTagIds,
        resumed: true,
      };
    }

    const extraMetricKeys = await this.getEnabledExtraMetricKeys(user);
    const firstStep = this.getFirstMetricStep(user, extraMetricKeys);

    if (!firstStep) {
      await this.fsmService.setIdle(user.id);
      return { status: 'missing_context' };
    }

    await this.fsmService.setState(user.id, firstStep.state, {
      extraMetricKeys,
      ...(firstStep.activeMetricKey ? { activeMetricKey: firstStep.activeMetricKey } : {}),
    });
    await this.analyticsService.track('checkin_started', {}, user.id);

    return {
      status: 'next',
      nextState: firstStep.state,
      resumed: false,
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

    if (state === FSM_STATES.checkin_metric_score) {
      const activeMetricKey = payload.activeMetricKey;

      if (!activeMetricKey) {
        return { status: 'missing_context' };
      }

      return this.advanceFromExtraMetricState(user, {
        ...payload,
        metricScores: {
          ...(payload.metricScores ?? {}),
          [activeMetricKey]: score,
        },
      });
    }

    if (
      state !== FSM_STATES.checkin_mood &&
      state !== FSM_STATES.checkin_energy &&
      state !== FSM_STATES.checkin_stress &&
      state !== FSM_STATES.checkin_sleep_quality
    ) {
      return { status: 'not_in_checkin' };
    }

    return this.advanceFromCoreState(user, state, {
      ...payload,
      [mapCoreStateToPayloadKey(state)]: score,
    });
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

    return this.advanceFromCoreState(user, state, {
      ...payload,
      sleepHours: parsed,
    });
  }

  async beginNoteStep(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.checkin_note_prompt) {
      return { status: 'not_in_checkin' };
    }

    const payload = this.extractPayload(session?.payloadJson);

    await this.fsmService.setState(user.id, FSM_STATES.checkin_note, payload);

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_note,
    };
  }

  async submitNote(user: User, noteText: string): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.checkin_note) {
      return { status: 'not_in_checkin' };
    }

    const payload = this.extractPayload(session?.payloadJson);

    if (!payload.entryId) {
      return { status: 'missing_context' };
    }

    try {
      await this.checkinsService.saveNote(payload.entryId, noteText);
    } catch {
      return { status: 'invalid_note' };
    }

    await this.analyticsService.track('note_added', { entryId: payload.entryId }, user.id);

    await this.fsmService.setState(user.id, FSM_STATES.checkin_tags_prompt, {
      ...payload,
      noteText: noteText.trim(),
    });

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_tags_prompt,
    };
  }

  async startTagsSelection(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.checkin_tags_prompt) {
      return { status: 'not_in_checkin' };
    }

    const payload = this.extractPayload(session?.payloadJson);
    const selectedTagIds = [...new Set(payload.selectedTagIds ?? [])];

    await this.fsmService.setState(user.id, FSM_STATES.checkin_tags, {
      ...payload,
      selectedTagIds,
    });

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_tags,
      selectedTagIds,
    };
  }

  async toggleTagSelection(user: User, tagId: string): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.checkin_tags) {
      return { status: 'not_in_checkin' };
    }

    const payload = this.extractPayload(session?.payloadJson);
    const activeTag = await this.tagsService.findActiveTagById(tagId);

    if (!activeTag) {
      return { status: 'invalid_tag' };
    }

    const selectedSet = new Set(payload.selectedTagIds ?? []);

    if (selectedSet.has(tagId)) {
      selectedSet.delete(tagId);
    } else {
      selectedSet.add(tagId);
    }

    const selectedTagIds = [...selectedSet];

    await this.fsmService.setState(user.id, FSM_STATES.checkin_tags, {
      ...payload,
      selectedTagIds,
    });

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_tags,
      selectedTagIds,
    };
  }

  async confirmTags(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.checkin_tags) {
      return { status: 'not_in_checkin' };
    }

    const payload = this.extractPayload(session?.payloadJson);

    if (!payload.entryId) {
      return { status: 'missing_context' };
    }

    const selectedTagIds = [...new Set(payload.selectedTagIds ?? [])];

    try {
      await this.checkinsService.attachTags(payload.entryId, selectedTagIds);
    } catch {
      return { status: 'invalid_tag' };
    }

    if (selectedTagIds.length > 0) {
      await this.analyticsService.track(
        'tags_attached',
        {
          entryId: payload.entryId,
          count: selectedTagIds.length,
        },
        user.id,
      );
    }

    await this.fsmService.setState(user.id, FSM_STATES.checkin_add_event_confirm, {
      ...payload,
      selectedTagIds,
    });

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_add_event_confirm,
    };
  }

  async finalizeAfterEventSkip(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.checkin_add_event_confirm) {
      return { status: 'not_in_checkin' };
    }

    const payload = this.extractPayload(session?.payloadJson);
    return this.finishOptionalFlow(user, payload);
  }

  async skipCurrentStep(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (state === FSM_STATES.checkin_sleep_hours || state === FSM_STATES.checkin_sleep_quality) {
      const nextPayload = this.withoutKeys(payload, [mapCoreStateToPayloadKey(state)]);

      if (!this.canSkipCoreState(user, state, nextPayload)) {
        return { status: 'cannot_skip' };
      }

      return this.advanceFromCoreState(user, state, nextPayload);
    }

    if (state === FSM_STATES.checkin_note_prompt) {
      await this.fsmService.setState(user.id, FSM_STATES.checkin_tags_prompt, payload);
      return {
        status: 'next',
        nextState: FSM_STATES.checkin_tags_prompt,
      };
    }

    if (state === FSM_STATES.checkin_tags_prompt) {
      await this.fsmService.setState(user.id, FSM_STATES.checkin_add_event_confirm, payload);
      return {
        status: 'next',
        nextState: FSM_STATES.checkin_add_event_confirm,
      };
    }

    if (state === FSM_STATES.checkin_tags) {
      await this.fsmService.setState(user.id, FSM_STATES.checkin_add_event_confirm, payload);
      return {
        status: 'next',
        nextState: FSM_STATES.checkin_add_event_confirm,
      };
    }

    if (state === FSM_STATES.checkin_add_event_confirm) {
      return this.finishOptionalFlow(user, payload);
    }

    return { status: 'not_in_checkin' };
  }

  async goBack(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (isCoreCheckinState(state)) {
      const previousState = getPreviousCoreCheckinState(user, state);

      if (!previousState) {
        return { status: 'cannot_back' };
      }

      await this.fsmService.setState(
        user.id,
        previousState,
        this.withoutKeys(payload, this.getCorePayloadKeysFromState(user, state)),
      );

      return { status: 'next', nextState: previousState };
    }

    if (state === FSM_STATES.checkin_metric_score) {
      const previousStep = this.getPreviousExtraMetricStep(user, payload);

      if (!previousStep) {
        return { status: 'cannot_back' };
      }

      await this.fsmService.setState(
        user.id,
        previousStep.state,
        this.clearMetricProgressFrom(payload, user, previousStep),
      );

      return { status: 'next', nextState: previousStep.state };
    }

    switch (state) {
      case FSM_STATES.checkin_note_prompt: {
        const previousMetricStep = this.getLastMetricStep(user, payload);

        if (!previousMetricStep) {
          return { status: 'cannot_back' };
        }

        await this.fsmService.setState(user.id, previousMetricStep.state, {
          ...this.withoutKeys(payload, ['entryId', 'isUpdate']),
          ...(previousMetricStep.activeMetricKey ? { activeMetricKey: previousMetricStep.activeMetricKey } : {}),
        });
        return { status: 'next', nextState: previousMetricStep.state };
      }
      case FSM_STATES.checkin_note: {
        await this.fsmService.setState(user.id, FSM_STATES.checkin_note_prompt, payload);
        return { status: 'next', nextState: FSM_STATES.checkin_note_prompt };
      }
      case FSM_STATES.checkin_tags_prompt: {
        await this.fsmService.setState(user.id, FSM_STATES.checkin_note_prompt, payload);
        return { status: 'next', nextState: FSM_STATES.checkin_note_prompt };
      }
      case FSM_STATES.checkin_tags: {
        await this.fsmService.setState(user.id, FSM_STATES.checkin_tags_prompt, payload);
        return { status: 'next', nextState: FSM_STATES.checkin_tags_prompt };
      }
      case FSM_STATES.checkin_add_event_confirm: {
        await this.fsmService.setState(user.id, FSM_STATES.checkin_tags_prompt, payload);
        return { status: 'next', nextState: FSM_STATES.checkin_tags_prompt };
      }
      default:
        return { status: 'not_in_checkin' };
    }
  }

  async cancel(userId: string): Promise<void> {
    await this.fsmService.clearSession(userId);
  }

  private async persistCoreEntryAndMoveToOptional(
    user: User,
    payload: CheckinDraftPayload,
  ): Promise<CheckinFlowResult> {
    if (!this.hasCapturedAnyMetric(payload)) {
      const firstStep = this.getFirstMetricStep(user, payload.extraMetricKeys ?? []);

      if (!firstStep) {
        await this.fsmService.setIdle(user.id);
        return { status: 'missing_context' };
      }

      await this.fsmService.setState(user.id, firstStep.state, {
        ...this.withoutKeys(payload, ['entryId', 'isUpdate']),
        ...(firstStep.activeMetricKey ? { activeMetricKey: firstStep.activeMetricKey } : {}),
      });
      return { status: 'next', nextState: firstStep.state };
    }

    const entryPayload = this.buildEntryPayload(payload);

    const result = await this.checkinsService.upsertTodayEntry(user.id, entryPayload, {
      timezone: user.timezone,
    });

    await this.analyticsService.track(
      result.isUpdate ? 'checkin_updated' : 'checkin_completed',
      { entryId: result.entry.id },
      user.id,
    );

    await this.fsmService.setState(user.id, FSM_STATES.checkin_note_prompt, {
      ...payload,
      entryId: result.entry.id,
      entryDateKey: formatDateKey(result.entry.entryDate),
      isUpdate: result.isUpdate,
    });

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_note_prompt,
    };
  }

  private async finishOptionalFlow(user: User, payload: CheckinDraftPayload): Promise<CheckinFlowResult> {
    if (!this.hasCapturedAnyMetric(payload)) {
      const firstStep = this.getFirstMetricStep(user, payload.extraMetricKeys ?? []);

      if (!firstStep) {
        await this.fsmService.setIdle(user.id);
        return { status: 'missing_context' };
      }

      await this.fsmService.setState(user.id, firstStep.state, {
        ...this.withoutKeys(payload, ['entryId', 'isUpdate']),
        ...(firstStep.activeMetricKey ? { activeMetricKey: firstStep.activeMetricKey } : {}),
      });
      return { status: 'next', nextState: firstStep.state };
    }

    const entryPayload: UpsertDailyEntryDto = {
      ...this.buildEntryPayload(payload),
      noteText: payload.noteText,
    };

    await this.fsmService.setIdle(user.id);

    return {
      status: 'saved',
      isUpdate: payload.isUpdate ?? false,
      entryPayload,
      noteAdded: !!payload.noteText,
      tagsCount: payload.selectedTagIds?.length ?? 0,
      eventAdded: !!payload.eventAdded,
    };
  }

  private async advanceFromCoreState(
    user: User,
    state: CoreCheckinState,
    payload: CheckinDraftPayload,
  ): Promise<CheckinFlowResult> {
    const nextStep = this.getNextStepFromCoreState(user, state, payload);

    if (!nextStep) {
      return this.persistCoreEntryAndMoveToOptional(user, payload);
    }

    await this.fsmService.setState(user.id, nextStep.state, {
      ...payload,
      ...(nextStep.activeMetricKey ? { activeMetricKey: nextStep.activeMetricKey } : {}),
    });

    return {
      status: 'next',
      nextState: nextStep.state,
    };
  }

  private async advanceFromExtraMetricState(
    user: User,
    payload: CheckinDraftPayload,
  ): Promise<CheckinFlowResult> {
    const nextMetricKey = this.getNextExtraMetricKey(payload);

    if (!nextMetricKey) {
      return this.persistCoreEntryAndMoveToOptional(user, payload);
    }

    await this.fsmService.setState(user.id, FSM_STATES.checkin_metric_score, {
      ...payload,
      activeMetricKey: nextMetricKey,
    });

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_metric_score,
    };
  }

  private canSkipCoreState(
    user: User,
    state: CoreCheckinState,
    payloadAfterSkip: CheckinDraftPayload,
  ): boolean {
    const nextStep = this.getNextStepFromCoreState(user, state, payloadAfterSkip);

    if (nextStep) {
      return true;
    }

    return this.hasCapturedAnyMetric(payloadAfterSkip);
  }

  private getFirstCoreState(user: User): CoreCheckinState | null {
    return buildCoreCheckinStates(user)[0] ?? null;
  }

  private getLastCoreState(user: User): CoreCheckinState | null {
    const states = buildCoreCheckinStates(user);
    return states[states.length - 1] ?? null;
  }

  private getFirstMetricStep(user: User, extraMetricKeys: string[]): CheckinStepTarget | null {
    const firstCoreState = this.getFirstCoreState(user);

    if (firstCoreState) {
      return { state: firstCoreState };
    }

    if (extraMetricKeys.length === 0) {
      return null;
    }

    return {
      state: FSM_STATES.checkin_metric_score,
      activeMetricKey: extraMetricKeys[0],
    };
  }

  private getLastMetricStep(user: User, payload: CheckinDraftPayload): CheckinStepTarget | null {
    const extraMetricKeys = payload.extraMetricKeys ?? [];

    if (extraMetricKeys.length > 0) {
      return {
        state: FSM_STATES.checkin_metric_score,
        activeMetricKey: extraMetricKeys[extraMetricKeys.length - 1],
      };
    }

    const lastCoreState = this.getLastCoreState(user);

    if (!lastCoreState) {
      return null;
    }

    return { state: lastCoreState };
  }

  private getNextStepFromCoreState(
    user: User,
    state: CoreCheckinState,
    payload: CheckinDraftPayload,
  ): CheckinStepTarget | null {
    const nextCoreState = getNextCoreCheckinState(user, state);

    if (nextCoreState) {
      return { state: nextCoreState };
    }

    const firstExtraMetricKey = payload.extraMetricKeys?.[0];

    if (!firstExtraMetricKey) {
      return null;
    }

    return {
      state: FSM_STATES.checkin_metric_score,
      activeMetricKey: firstExtraMetricKey,
    };
  }

  private getNextExtraMetricKey(payload: CheckinDraftPayload): string | null {
    const activeMetricKey = payload.activeMetricKey;
    const extraMetricKeys = payload.extraMetricKeys ?? [];

    if (!activeMetricKey) {
      return null;
    }

    const currentIndex = extraMetricKeys.indexOf(activeMetricKey);

    if (currentIndex === -1 || currentIndex >= extraMetricKeys.length - 1) {
      return null;
    }

    return extraMetricKeys[currentIndex + 1];
  }

  private getPreviousExtraMetricStep(user: User, payload: CheckinDraftPayload): CheckinStepTarget | null {
    const activeMetricKey = payload.activeMetricKey;
    const extraMetricKeys = payload.extraMetricKeys ?? [];

    if (!activeMetricKey) {
      return null;
    }

    const currentIndex = extraMetricKeys.indexOf(activeMetricKey);

    if (currentIndex === -1) {
      return null;
    }

    if (currentIndex > 0) {
      return {
        state: FSM_STATES.checkin_metric_score,
        activeMetricKey: extraMetricKeys[currentIndex - 1],
      };
    }

    const lastCoreState = this.getLastCoreState(user);

    if (!lastCoreState) {
      return null;
    }

    return { state: lastCoreState };
  }

  private getCorePayloadKeysFromState(
    user: User,
    state: CoreCheckinState,
  ): Array<keyof CheckinDraftPayload> {
    const states = buildCoreCheckinStates(user);
    const currentIndex = states.indexOf(state);

    if (currentIndex === -1) {
      return [];
    }

    return states.slice(currentIndex).map((item) => mapCoreStateToPayloadKey(item));
  }

  private buildEntryPayload(payload: CheckinDraftPayload): UpsertDailyEntryDto {
    const entryPayload: UpsertDailyEntryDto = {};
    const metricValues = new Map<string, number>();

    if (typeof payload.moodScore === 'number') {
      entryPayload.moodScore = payload.moodScore;
      metricValues.set('mood', payload.moodScore);
    }

    if (typeof payload.energyScore === 'number') {
      entryPayload.energyScore = payload.energyScore;
      metricValues.set('energy', payload.energyScore);
    }

    if (typeof payload.stressScore === 'number') {
      entryPayload.stressScore = payload.stressScore;
      metricValues.set('stress', payload.stressScore);
    }

    if (typeof payload.sleepHours === 'number') {
      entryPayload.sleepHours = payload.sleepHours;
    }

    if (typeof payload.sleepQuality === 'number') {
      entryPayload.sleepQuality = payload.sleepQuality;
    }

    for (const [key, value] of Object.entries(payload.metricScores ?? {})) {
      if (typeof value === 'number') {
        metricValues.set(key, value);
      }
    }

    if (metricValues.size > 0) {
      entryPayload.metricValues = [...metricValues.entries()].map(
        ([key, value]): DailyMetricValueInput => ({
          key,
          value,
        }),
      );
    }

    return entryPayload;
  }

  private extractPayload(payload: unknown): CheckinDraftPayload {
    if (!payload || typeof payload !== 'object') {
      return {};
    }

    return payload as CheckinDraftPayload;
  }

  private isCheckinState(state: FsmState): boolean {
    return (
      state === FSM_STATES.checkin_mood ||
      state === FSM_STATES.checkin_energy ||
      state === FSM_STATES.checkin_stress ||
      state === FSM_STATES.checkin_metric_score ||
      state === FSM_STATES.checkin_sleep_hours ||
      state === FSM_STATES.checkin_sleep_quality ||
      state === FSM_STATES.checkin_note_prompt ||
      state === FSM_STATES.checkin_note ||
      state === FSM_STATES.checkin_tags_prompt ||
      state === FSM_STATES.checkin_tags ||
      state === FSM_STATES.checkin_add_event_confirm
    );
  }

  private isCheckinEventState(state: FsmState, payload: CheckinDraftPayload): boolean {
    if (
      state !== FSM_STATES.event_type &&
      state !== FSM_STATES.event_title &&
      state !== FSM_STATES.event_score &&
      state !== FSM_STATES.event_description &&
      state !== FSM_STATES.event_end_date &&
      state !== FSM_STATES.event_repeat_mode &&
      state !== FSM_STATES.event_repeat_count
    ) {
      return false;
    }

    return payload.eventFlowSource === 'checkin';
  }

  private withoutKeys(payload: CheckinDraftPayload, keys: Array<keyof CheckinDraftPayload>): CheckinDraftPayload {
    const next = { ...payload };

    for (const key of keys) {
      delete next[key];
    }

    return next;
  }

  private hasCapturedAnyMetric(payload: CheckinDraftPayload): boolean {
    return hasCapturedCoreMetric(payload) || Object.keys(payload.metricScores ?? {}).length > 0;
  }

  private clearMetricProgressFrom(
    payload: CheckinDraftPayload,
    user: User,
    previousStep: CheckinStepTarget,
  ): CheckinDraftPayload {
    const next = { ...payload };

    if (payload.activeMetricKey) {
      const extraMetricKeys = payload.extraMetricKeys ?? [];
      const currentIndex = extraMetricKeys.indexOf(payload.activeMetricKey);
      const metricScores = { ...(payload.metricScores ?? {}) };

      if (currentIndex !== -1) {
        for (const key of extraMetricKeys.slice(currentIndex)) {
          delete metricScores[key];
        }
      }

      next.metricScores = metricScores;
    }

    if (previousStep.state === FSM_STATES.checkin_metric_score) {
      next.activeMetricKey = previousStep.activeMetricKey;
      return next;
    }

    delete next.activeMetricKey;
    return next;
  }

  private async getEnabledExtraMetricKeys(user: User): Promise<string[]> {
    const metrics = await this.dailyMetricsService.getEnabledCheckinMetrics(user);

    return metrics
      .filter((metric) => !metric.isCore && metric.inputType === 'score')
      .map((metric) => metric.key);
  }
}
