import { Injectable } from '@nestjs/common';
import { type User } from '@prisma/client';

import { AnalyticsService } from '../analytics/analytics.service';
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

    await this.fsmService.setState(user.id, FSM_STATES.checkin_mood, {});
    await this.analyticsService.track('checkin_started', {}, user.id);

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_mood,
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
        return this.persistCoreEntryAndMoveToOptional(user, {
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

    return this.persistCoreEntryAndMoveToOptional(user, {
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
      return this.persistCoreEntryAndMoveToOptional(user, nextPayload);
    }

    if (state === FSM_STATES.checkin_sleep_quality) {
      const nextPayload = this.withoutKeys(payload, ['sleepQuality']);
      return this.persistCoreEntryAndMoveToOptional(user, nextPayload);
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
      case FSM_STATES.checkin_note_prompt: {
        const previousSleepState = this.resolvePreviousSleepState(user);
        await this.fsmService.setState(
          user.id,
          previousSleepState,
          this.withoutKeys(payload, ['entryId', 'isUpdate']),
        );
        return { status: 'next', nextState: previousSleepState };
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

  private resolvePreviousSleepState(user: User): FsmState {
    if (user.sleepMode === 'hours') {
      return FSM_STATES.checkin_sleep_hours;
    }

    return FSM_STATES.checkin_sleep_quality;
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
      state !== FSM_STATES.event_end_date
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
