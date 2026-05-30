import { Injectable } from '@nestjs/common';
import { SleepMode, type User } from '@prisma/client';

import { AnalyticsService } from '../analytics/analytics.service';
import { formatDateKey } from '../common/utils/date.utils';
import { parseSleepHours } from '../common/utils/validation.utils';
import { DailyMetricsService } from '../daily-metrics/daily-metrics.service';
import { FsmService } from '../fsm/fsm.service';
import { FSM_STATES, type CheckinDraftPayload, type FsmState } from '../fsm/fsm.types';
import { CheckinsService } from './checkins.service';
import {
  CHECKIN_V2_METRIC_BY_KEY,
  isCheckinV2MetricKey,
  type CheckinV2MetricKey,
} from './checkins-v2.catalog';
import type { DailyEntryV2MetricValueInput, UpsertDailyEntryDto } from './dto/upsert-daily-entry.dto';

export type CheckinFlowStatus =
  | 'next'
  | 'saved'
  | 'invalid_score'
  | 'invalid_sleep_hours'
  | 'invalid_note'
  | 'invalid_tag'
  | 'too_many_metric_tags'
  | 'cannot_back'
  | 'cannot_skip'
  | 'not_in_checkin'
  | 'missing_context';

export interface CheckinFlowResult {
  status: CheckinFlowStatus;
  nextState?: FsmState;
  isUpdate?: boolean;
  entryPayload?: UpsertDailyEntryDto;
  selectedTagKeys?: string[];
  noteAdded?: boolean;
  tagsCount?: number;
  eventAdded?: boolean;
  resumed?: boolean;
  showMenuAfterSave?: boolean;
}

@Injectable()
export class CheckinsFlowService {
  constructor(
    private readonly checkinsService: CheckinsService,
    private readonly dailyMetricsService: DailyMetricsService,
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
        selectedTagKeys: this.getActiveSelectedTagKeys(payload),
        resumed: true,
      };
    }

    const metricKeys = await this.getEnabledStateMetricKeys(user);
    const firstMetricKey = metricKeys[0];

    if (!firstMetricKey) {
      await this.fsmService.setIdle(user.id);
      return { status: 'missing_context' };
    }

    await this.fsmService.setState(user.id, FSM_STATES.checkin_metric_score, {
      metricKeys,
      activeMetricKey: firstMetricKey,
      metricScores: {},
      metricTags: {},
    });
    await this.analyticsService.track('checkin_started', { version: 'v2' }, user.id);

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_metric_score,
      resumed: false,
    };
  }

  async submitScore(user: User, value: string | number): Promise<CheckinFlowResult> {
    const score = this.parseOrdinalScore(value);

    if (score === null) {
      return { status: 'invalid_score' };
    }

    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (state === FSM_STATES.checkin_sleep_quality) {
      return this.advanceFromSleepQuality(user, {
        ...payload,
        sleepQuality: score,
      });
    }

    if (state !== FSM_STATES.checkin_metric_score) {
      return { status: 'not_in_checkin' };
    }

    const activeMetricKey = this.getActiveMetricKey(payload);

    if (!activeMetricKey) {
      return { status: 'missing_context' };
    }

    await this.fsmService.setState(user.id, FSM_STATES.checkin_metric_tags, {
      ...payload,
      metricScores: {
        ...(payload.metricScores ?? {}),
        [activeMetricKey]: score,
      },
      activeMetricKey,
      selectedTagKeys: this.getMetricTagKeys(payload, activeMetricKey),
    });

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_metric_tags,
      selectedTagKeys: this.getMetricTagKeys(payload, activeMetricKey),
    };
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

    const nextPayload = {
      ...payload,
      sleepHours: parsed,
    };

    if (payload.editingSleepField === 'hours') {
      return this.moveToReview(user, nextPayload);
    }

    if (user.sleepMode === SleepMode.both) {
      await this.fsmService.setState(user.id, FSM_STATES.checkin_sleep_quality, nextPayload);
      return { status: 'next', nextState: FSM_STATES.checkin_sleep_quality };
    }

    return this.moveToReview(user, nextPayload);
  }

  async toggleMetricTagSelection(user: User, tagKey: string): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (state !== FSM_STATES.checkin_metric_tags) {
      return { status: 'not_in_checkin' };
    }

    const activeMetricKey = this.getActiveMetricKey(payload);

    if (!activeMetricKey) {
      return { status: 'missing_context' };
    }

    const definition = CHECKIN_V2_METRIC_BY_KEY[activeMetricKey];

    if (!definition.tags.some((tag) => tag.key === tagKey)) {
      return { status: 'invalid_tag' };
    }

    const selectedSet = new Set(this.getMetricTagKeys(payload, activeMetricKey));

    if (selectedSet.has(tagKey)) {
      selectedSet.delete(tagKey);
    } else if (selectedSet.size >= definition.maxTags) {
      return { status: 'too_many_metric_tags', selectedTagKeys: [...selectedSet] };
    } else {
      selectedSet.add(tagKey);
    }

    const selectedTagKeys = [...selectedSet];
    const metricTags = {
      ...(payload.metricTags ?? {}),
      [activeMetricKey]: selectedTagKeys,
    };

    await this.fsmService.setState(user.id, FSM_STATES.checkin_metric_tags, {
      ...payload,
      metricTags,
      selectedTagKeys,
    });

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_metric_tags,
      selectedTagKeys,
    };
  }

  async confirmMetricTags(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (state !== FSM_STATES.checkin_metric_tags) {
      return { status: 'not_in_checkin' };
    }

    return this.advanceFromMetricTags(user, payload);
  }

  async confirmReview(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (state !== FSM_STATES.checkin_review) {
      return { status: 'not_in_checkin' };
    }

    return this.persistReviewAndMoveToEvent(user, payload);
  }

  async startReviewEdit(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (state !== FSM_STATES.checkin_review) {
      return { status: 'not_in_checkin' };
    }

    await this.fsmService.setState(user.id, FSM_STATES.checkin_review_edit, payload);
    return { status: 'next', nextState: FSM_STATES.checkin_review_edit };
  }

  async editReviewMetric(user: User, target: string): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (state !== FSM_STATES.checkin_review_edit) {
      return { status: 'not_in_checkin' };
    }

    if (target === 'sleep_hours') {
      await this.fsmService.setState(user.id, FSM_STATES.checkin_sleep_hours, {
        ...payload,
        editingSleepField: 'hours',
      });
      return { status: 'next', nextState: FSM_STATES.checkin_sleep_hours };
    }

    if (target === 'sleep_quality') {
      await this.fsmService.setState(user.id, FSM_STATES.checkin_sleep_quality, {
        ...payload,
        editingSleepField: 'quality',
      });
      return { status: 'next', nextState: FSM_STATES.checkin_sleep_quality };
    }

    if (!isCheckinV2MetricKey(target) || !(payload.metricKeys ?? []).includes(target)) {
      return { status: 'missing_context' };
    }

    const metricScores = { ...(payload.metricScores ?? {}) };
    const metricTags = { ...(payload.metricTags ?? {}) };
    delete metricScores[target];
    delete metricTags[target];

    await this.fsmService.setState(user.id, FSM_STATES.checkin_metric_score, {
      ...payload,
      activeMetricKey: target,
      editingMetricKey: target,
      metricScores,
      metricTags,
      selectedTagKeys: [],
    });

    return { status: 'next', nextState: FSM_STATES.checkin_metric_score };
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

    return this.finishOptionalFlow(user, {
      ...payload,
      noteText: noteText.trim(),
    });
  }

  async finalizeAfterEventSkip(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.checkin_add_event_confirm) {
      return { status: 'not_in_checkin' };
    }

    const payload = this.extractPayload(session?.payloadJson);

    await this.fsmService.setState(user.id, FSM_STATES.checkin_note_prompt, payload);
    return { status: 'next', nextState: FSM_STATES.checkin_note_prompt };
  }

  async skipCurrentStep(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (state === FSM_STATES.checkin_metric_tags) {
      const activeMetricKey = this.getActiveMetricKey(payload);

      if (!activeMetricKey) {
        return { status: 'missing_context' };
      }

      return this.advanceFromMetricTags(user, {
        ...payload,
        metricTags: {
          ...(payload.metricTags ?? {}),
          [activeMetricKey]: [],
        },
        selectedTagKeys: [],
      });
    }

    if (state === FSM_STATES.checkin_sleep_hours) {
      return this.advanceFromSleepHoursSkip(user, payload);
    }

    if (state === FSM_STATES.checkin_sleep_quality) {
      return this.advanceFromSleepQuality(user, this.withoutKeys(payload, ['sleepQuality']));
    }

    if (state === FSM_STATES.checkin_add_event_confirm) {
      return this.finalizeAfterEventSkip(user);
    }

    if (state === FSM_STATES.checkin_note_prompt) {
      return this.finishOptionalFlow(user, payload);
    }

    return { status: 'not_in_checkin' };
  }

  async goBack(user: User): Promise<CheckinFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    switch (state) {
      case FSM_STATES.checkin_metric_score:
        return this.backFromMetricScore(user, payload);
      case FSM_STATES.checkin_metric_tags: {
        await this.fsmService.setState(user.id, FSM_STATES.checkin_metric_score, payload);
        return { status: 'next', nextState: FSM_STATES.checkin_metric_score };
      }
      case FSM_STATES.checkin_sleep_hours:
        return this.backToLastMetricTags(user, payload);
      case FSM_STATES.checkin_sleep_quality:
        if (user.sleepMode === SleepMode.both && typeof payload.sleepHours === 'number') {
          await this.fsmService.setState(user.id, FSM_STATES.checkin_sleep_hours, this.withoutKeys(payload, ['sleepQuality']));
          return { status: 'next', nextState: FSM_STATES.checkin_sleep_hours };
        }

        return this.backToLastMetricTags(user, payload);
      case FSM_STATES.checkin_review:
        return this.backFromReview(user, payload);
      case FSM_STATES.checkin_review_edit:
        await this.fsmService.setState(user.id, FSM_STATES.checkin_review, payload);
        return { status: 'next', nextState: FSM_STATES.checkin_review };
      case FSM_STATES.checkin_add_event_confirm:
        await this.fsmService.setState(user.id, FSM_STATES.checkin_review, payload);
        return { status: 'next', nextState: FSM_STATES.checkin_review };
      case FSM_STATES.checkin_note_prompt:
        await this.fsmService.setState(user.id, FSM_STATES.checkin_add_event_confirm, payload);
        return { status: 'next', nextState: FSM_STATES.checkin_add_event_confirm };
      case FSM_STATES.checkin_note:
        await this.fsmService.setState(user.id, FSM_STATES.checkin_note_prompt, payload);
        return { status: 'next', nextState: FSM_STATES.checkin_note_prompt };
      default:
        return { status: 'not_in_checkin' };
    }
  }

  async cancel(userId: string): Promise<void> {
    await this.fsmService.clearSession(userId);
  }

  private async advanceFromMetricTags(
    user: User,
    payload: CheckinDraftPayload,
  ): Promise<CheckinFlowResult> {
    if (payload.editingMetricKey) {
      return this.moveToReview(user, this.withoutKeys(payload, ['editingMetricKey', 'selectedTagKeys']));
    }

    const nextMetricKey = this.getNextMetricKey(payload);

    if (nextMetricKey) {
      await this.fsmService.setState(user.id, FSM_STATES.checkin_metric_score, {
        ...payload,
        activeMetricKey: nextMetricKey,
        selectedTagKeys: [],
      });
      return { status: 'next', nextState: FSM_STATES.checkin_metric_score };
    }

    const sleepState = this.getFirstSleepState(user);

    if (sleepState) {
      await this.fsmService.setState(user.id, sleepState, this.withoutKeys(payload, ['activeMetricKey', 'selectedTagKeys']));
      return { status: 'next', nextState: sleepState };
    }

    return this.moveToReview(user, this.withoutKeys(payload, ['activeMetricKey', 'selectedTagKeys']));
  }

  private async advanceFromSleepHoursSkip(user: User, payload: CheckinDraftPayload): Promise<CheckinFlowResult> {
    if (payload.editingSleepField === 'hours') {
      return this.moveToReview(user, this.withoutKeys(payload, ['sleepHours', 'editingSleepField']));
    }

    if (user.sleepMode === SleepMode.both) {
      await this.fsmService.setState(user.id, FSM_STATES.checkin_sleep_quality, this.withoutKeys(payload, ['sleepHours']));
      return { status: 'next', nextState: FSM_STATES.checkin_sleep_quality };
    }

    return this.moveToReview(user, this.withoutKeys(payload, ['sleepHours']));
  }

  private async advanceFromSleepQuality(
    user: User,
    payload: CheckinDraftPayload,
  ): Promise<CheckinFlowResult> {
    if (payload.editingSleepField === 'quality') {
      return this.moveToReview(user, this.withoutKeys(payload, ['editingSleepField']));
    }

    return this.moveToReview(user, payload);
  }

  private async moveToReview(user: User, payload: CheckinDraftPayload): Promise<CheckinFlowResult> {
    if (!this.hasAllRequiredMetricScores(payload)) {
      return { status: 'missing_context' };
    }

    await this.fsmService.setState(
      user.id,
      FSM_STATES.checkin_review,
      this.withoutKeys(payload, ['activeMetricKey', 'selectedTagKeys', 'editingMetricKey', 'editingSleepField']),
    );

    return { status: 'next', nextState: FSM_STATES.checkin_review };
  }

  private async persistReviewAndMoveToEvent(
    user: User,
    payload: CheckinDraftPayload,
  ): Promise<CheckinFlowResult> {
    if (!this.hasAllRequiredMetricScores(payload)) {
      return { status: 'missing_context' };
    }

    const entryPayload = this.buildEntryPayload(payload);
    const result = await this.checkinsService.upsertTodayEntry(user.id, entryPayload, {
      timezone: user.timezone,
    });

    await this.analyticsService.track(
      result.isUpdate ? 'checkin_updated' : 'checkin_completed',
      { entryId: result.entry.id, version: 'v2' },
      user.id,
    );

    await this.fsmService.setState(user.id, FSM_STATES.checkin_add_event_confirm, {
      ...payload,
      entryId: result.entry.id,
      entryDateKey: formatDateKey(result.entry.entryDate),
      isUpdate: result.isUpdate,
    });

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_add_event_confirm,
    };
  }

  private async finishOptionalFlow(user: User, payload: CheckinDraftPayload): Promise<CheckinFlowResult> {
    if (!payload.entryId) {
      return { status: 'missing_context' };
    }

    await this.fsmService.setIdle(user.id);

    return {
      status: 'saved',
      isUpdate: payload.isUpdate ?? false,
      entryPayload: {
        ...this.buildEntryPayload(payload),
        noteText: payload.noteText,
      },
      noteAdded: !!payload.noteText,
      tagsCount: this.countMetricTags(payload),
      eventAdded: !!payload.eventAdded,
      showMenuAfterSave: !!payload.showMenuAfterSave,
    };
  }

  private buildEntryPayload(payload: CheckinDraftPayload): UpsertDailyEntryDto {
    return {
      sleepHours: payload.sleepHours,
      sleepQuality: payload.sleepQuality,
      v2MetricValues: this.buildV2MetricPayload(payload),
    };
  }

  private buildV2MetricPayload(payload: CheckinDraftPayload): DailyEntryV2MetricValueInput[] {
    const metricKeys = this.getMetricKeys(payload);
    const values: DailyEntryV2MetricValueInput[] = [];

    for (const metricKey of metricKeys) {
      const ordinalValue = payload.metricScores?.[metricKey];

      if (typeof ordinalValue !== 'number') {
        continue;
      }

      values.push({
        key: metricKey,
        ordinalValue,
        tagKeys: this.getMetricTagKeys(payload, metricKey),
      });
    }

    return values;
  }

  private async backFromMetricScore(user: User, payload: CheckinDraftPayload): Promise<CheckinFlowResult> {
    if (payload.editingMetricKey) {
      await this.fsmService.setState(user.id, FSM_STATES.checkin_review, this.withoutKeys(payload, ['editingMetricKey']));
      return { status: 'next', nextState: FSM_STATES.checkin_review };
    }

    const activeMetricKey = this.getActiveMetricKey(payload);
    const metricKeys = this.getMetricKeys(payload);

    if (!activeMetricKey) {
      return { status: 'missing_context' };
    }

    const currentIndex = metricKeys.indexOf(activeMetricKey);

    if (currentIndex <= 0) {
      return { status: 'cannot_back' };
    }

    const previousMetricKey = metricKeys[currentIndex - 1];

    await this.fsmService.setState(user.id, FSM_STATES.checkin_metric_tags, {
      ...payload,
      activeMetricKey: previousMetricKey,
      selectedTagKeys: this.getMetricTagKeys(payload, previousMetricKey),
    });

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_metric_tags,
      selectedTagKeys: this.getMetricTagKeys(payload, previousMetricKey),
    };
  }

  private async backToLastMetricTags(user: User, payload: CheckinDraftPayload): Promise<CheckinFlowResult> {
    const metricKeys = this.getMetricKeys(payload);
    const lastMetricKey = metricKeys[metricKeys.length - 1];

    if (!lastMetricKey) {
      return { status: 'cannot_back' };
    }

    await this.fsmService.setState(user.id, FSM_STATES.checkin_metric_tags, {
      ...this.withoutKeys(payload, ['sleepHours', 'sleepQuality']),
      activeMetricKey: lastMetricKey,
      selectedTagKeys: this.getMetricTagKeys(payload, lastMetricKey),
    });

    return {
      status: 'next',
      nextState: FSM_STATES.checkin_metric_tags,
      selectedTagKeys: this.getMetricTagKeys(payload, lastMetricKey),
    };
  }

  private async backFromReview(user: User, payload: CheckinDraftPayload): Promise<CheckinFlowResult> {
    if (user.trackSleep) {
      const state = user.sleepMode === SleepMode.hours ? FSM_STATES.checkin_sleep_hours : FSM_STATES.checkin_sleep_quality;
      await this.fsmService.setState(user.id, state, payload);
      return { status: 'next', nextState: state };
    }

    return this.backToLastMetricTags(user, payload);
  }

  private getNextMetricKey(payload: CheckinDraftPayload): CheckinV2MetricKey | null {
    const activeMetricKey = this.getActiveMetricKey(payload);
    const metricKeys = this.getMetricKeys(payload);

    if (!activeMetricKey) {
      return null;
    }

    const currentIndex = metricKeys.indexOf(activeMetricKey);

    if (currentIndex === -1 || currentIndex >= metricKeys.length - 1) {
      return null;
    }

    return metricKeys[currentIndex + 1];
  }

  private getFirstSleepState(user: User): FsmState | null {
    if (!user.trackSleep) {
      return null;
    }

    return user.sleepMode === SleepMode.quality ? FSM_STATES.checkin_sleep_quality : FSM_STATES.checkin_sleep_hours;
  }

  private async getEnabledStateMetricKeys(user: User): Promise<CheckinV2MetricKey[]> {
    const metrics = await this.dailyMetricsService.getEnabledCheckinMetrics(user);

    return metrics
      .filter((metric) => metric.inputType === 'score' && isCheckinV2MetricKey(metric.key))
      .map((metric) => metric.key as CheckinV2MetricKey);
  }

  private getMetricKeys(payload: CheckinDraftPayload): CheckinV2MetricKey[] {
    return (payload.metricKeys ?? []).filter(isCheckinV2MetricKey);
  }

  private getActiveMetricKey(payload: CheckinDraftPayload): CheckinV2MetricKey | null {
    const activeMetricKey = payload.activeMetricKey;

    if (!activeMetricKey || !isCheckinV2MetricKey(activeMetricKey)) {
      return null;
    }

    return activeMetricKey;
  }

  private getMetricTagKeys(payload: CheckinDraftPayload, metricKey: CheckinV2MetricKey): string[] {
    const values = payload.metricTags?.[metricKey];

    if (!Array.isArray(values)) {
      return [];
    }

    return [...new Set(values.filter((value): value is string => typeof value === 'string'))];
  }

  private getActiveSelectedTagKeys(payload: CheckinDraftPayload): string[] {
    const activeMetricKey = this.getActiveMetricKey(payload);

    if (!activeMetricKey) {
      return [];
    }

    return this.getMetricTagKeys(payload, activeMetricKey);
  }

  private hasAllRequiredMetricScores(payload: CheckinDraftPayload): boolean {
    const scores = payload.metricScores ?? {};
    return this.getMetricKeys(payload).every((metricKey) => typeof scores[metricKey] === 'number');
  }

  private countMetricTags(payload: CheckinDraftPayload): number {
    return Object.values(payload.metricTags ?? {}).reduce((sum, tags) => (
      Array.isArray(tags) ? sum + new Set(tags).size : sum
    ), 0);
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

  private parseOrdinalScore(value: string | number): number | null {
    const parsed = typeof value === 'number' ? value : Number(value);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
      return null;
    }

    return parsed;
  }

  private isCheckinState(state: FsmState): boolean {
    return (
      state === FSM_STATES.checkin_metric_score ||
      state === FSM_STATES.checkin_metric_tags ||
      state === FSM_STATES.checkin_sleep_hours ||
      state === FSM_STATES.checkin_sleep_quality ||
      state === FSM_STATES.checkin_review ||
      state === FSM_STATES.checkin_review_edit ||
      state === FSM_STATES.checkin_add_event_confirm ||
      state === FSM_STATES.checkin_note_prompt ||
      state === FSM_STATES.checkin_note
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
}
