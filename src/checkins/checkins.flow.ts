import { Injectable } from '@nestjs/common';
import { type User } from '@prisma/client';

import { AnalyticsService } from '../analytics/analytics.service';
import {
  buildCoreCheckinStates,
  getNextCoreCheckinState,
  getPreviousCoreCheckinState,
  hasCapturedCoreMetric,
  isCoreCheckinState,
  mapCoreStateToPayloadKey,
  type CoreCheckinState,
} from './checkins.steps';
import { formatDateKey } from '../common/utils/date.utils';
import { parseIntegerScore, parseSleepHours } from '../common/utils/validation.utils';
import { FsmService } from '../fsm/fsm.service';
import { FSM_STATES, type CheckinDraftPayload, type FsmState } from '../fsm/fsm.types';
import { TagsService } from '../tags/tags.service';
import { CheckinsService } from './checkins.service';
import type { UpsertDailyEntryDto } from './dto/upsert-daily-entry.dto';

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

@Injectable()
export class CheckinsFlowService {
  constructor(
    private readonly checkinsService: CheckinsService,
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

    const firstState = this.getFirstCoreState(user);

    if (!firstState) {
      await this.fsmService.setIdle(user.id);
      return { status: 'missing_context' };
    }

    await this.fsmService.setState(user.id, firstState, {});
    await this.analyticsService.track('checkin_started', {}, user.id);

    return {
      status: 'next',
      nextState: firstState,
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

    switch (state) {
      case FSM_STATES.checkin_note_prompt: {
        const previousCoreState = this.getLastCoreState(user);

        if (!previousCoreState) {
          return { status: 'cannot_back' };
        }

        await this.fsmService.setState(
          user.id,
          previousCoreState,
          this.withoutKeys(payload, ['entryId', 'isUpdate']),
        );
        return { status: 'next', nextState: previousCoreState };
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
    if (!hasCapturedCoreMetric(payload)) {
      const firstState = this.getFirstCoreState(user);

      if (!firstState) {
        await this.fsmService.setIdle(user.id);
        return { status: 'missing_context' };
      }

      await this.fsmService.setState(user.id, firstState, {});
      return { status: 'next', nextState: firstState };
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
    if (!hasCapturedCoreMetric(payload)) {
      const firstState = this.getFirstCoreState(user);

      if (!firstState) {
        await this.fsmService.setIdle(user.id);
        return { status: 'missing_context' };
      }

      await this.fsmService.setState(user.id, firstState, {});
      return { status: 'next', nextState: firstState };
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
    const nextState = getNextCoreCheckinState(user, state);

    if (!nextState) {
      return this.persistCoreEntryAndMoveToOptional(user, payload);
    }

    await this.fsmService.setState(user.id, nextState, payload);

    return {
      status: 'next',
      nextState,
    };
  }

  private canSkipCoreState(
    user: User,
    state: CoreCheckinState,
    payloadAfterSkip: CheckinDraftPayload,
  ): boolean {
    const nextState = getNextCoreCheckinState(user, state);

    if (nextState) {
      return true;
    }

    return hasCapturedCoreMetric(payloadAfterSkip);
  }

  private getFirstCoreState(user: User): CoreCheckinState | null {
    return buildCoreCheckinStates(user)[0] ?? null;
  }

  private getLastCoreState(user: User): CoreCheckinState | null {
    const states = buildCoreCheckinStates(user);
    return states[states.length - 1] ?? null;
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

    if (typeof payload.moodScore === 'number') {
      entryPayload.moodScore = payload.moodScore;
    }

    if (typeof payload.energyScore === 'number') {
      entryPayload.energyScore = payload.energyScore;
    }

    if (typeof payload.stressScore === 'number') {
      entryPayload.stressScore = payload.stressScore;
    }

    if (typeof payload.sleepHours === 'number') {
      entryPayload.sleepHours = payload.sleepHours;
    }

    if (typeof payload.sleepQuality === 'number') {
      entryPayload.sleepQuality = payload.sleepQuality;
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
}
