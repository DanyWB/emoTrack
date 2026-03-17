import { Injectable } from '@nestjs/common';
import { type User } from '@prisma/client';

import { AnalyticsService } from '../analytics/analytics.service';
import { formatDateKey } from '../common/utils/date.utils';
import { FsmService } from '../fsm/fsm.service';
import {
  FSM_STATES,
  type CheckinDraftPayload,
  type EventFlowSource,
  type FsmState,
} from '../fsm/fsm.types';
import { EventsService } from './events.service';

export type EventFlowStatus =
  | 'next'
  | 'created'
  | 'invalid_type'
  | 'invalid_title'
  | 'invalid_score'
  | 'invalid_description'
  | 'invalid_end_date'
  | 'cannot_back'
  | 'not_in_event_flow'
  | 'missing_context';

export interface EventFlowResult {
  status: EventFlowStatus;
  nextState?: FsmState;
  source?: EventFlowSource;
  checkinPayload?: CheckinDraftPayload;
  createdEventsCount?: number;
}

@Injectable()
export class EventsFlowService {
  constructor(
    private readonly eventsService: EventsService,
    private readonly fsmService: FsmService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async startStandalone(user: User): Promise<EventFlowResult> {
    const eventStartDate = this.eventsService.buildEventDate(new Date(), user.timezone);

    await this.fsmService.setState(user.id, FSM_STATES.event_type, {
      eventFlowSource: 'standalone',
      eventStartDateKey: formatDateKey(eventStartDate),
    });

    await this.analyticsService.track('event_started', { source: 'standalone' }, user.id);

    return {
      status: 'next',
      nextState: FSM_STATES.event_type,
      source: 'standalone',
    };
  }

  async startFromCheckin(user: User): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    if (state !== FSM_STATES.checkin_add_event_confirm || !payload.entryId) {
      return { status: 'missing_context' };
    }

    await this.fsmService.setState(user.id, FSM_STATES.event_type, {
      ...payload,
      eventFlowSource: 'checkin',
      eventStartDateKey: payload.entryDateKey,
    });

    await this.analyticsService.track('event_started', { source: 'checkin' }, user.id);

    return {
      status: 'next',
      nextState: FSM_STATES.event_type,
      source: 'checkin',
    };
  }

  async submitType(user: User, rawType: string): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.event_type) {
      return { status: 'not_in_event_flow' };
    }

    const payload = this.extractPayload(session?.payloadJson);
    const eventType = this.eventsService.validateEventType(rawType);

    if (!eventType) {
      return { status: 'invalid_type', source: payload.eventFlowSource };
    }

    await this.fsmService.setState(user.id, FSM_STATES.event_title, {
      ...payload,
      eventType,
    });

    return {
      status: 'next',
      nextState: FSM_STATES.event_title,
      source: payload.eventFlowSource,
    };
  }

  async submitTitle(user: User, rawTitle: string): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.event_title) {
      return { status: 'not_in_event_flow' };
    }

    const payload = this.extractPayload(session?.payloadJson);
    const title = this.eventsService.validateEventTitle(rawTitle);

    if (!title) {
      return { status: 'invalid_title', source: payload.eventFlowSource };
    }

    await this.fsmService.setState(user.id, FSM_STATES.event_score, {
      ...payload,
      eventTitle: title,
    });

    return {
      status: 'next',
      nextState: FSM_STATES.event_score,
      source: payload.eventFlowSource,
    };
  }

  async submitScore(user: User, value: string | number): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.event_score) {
      return { status: 'not_in_event_flow' };
    }

    const payload = this.extractPayload(session?.payloadJson);
    const score = this.eventsService.validateEventScore(value);

    if (score === null) {
      return { status: 'invalid_score', source: payload.eventFlowSource };
    }

    await this.fsmService.setState(user.id, FSM_STATES.event_description, {
      ...payload,
      eventScore: score,
    });

    return {
      status: 'next',
      nextState: FSM_STATES.event_description,
      source: payload.eventFlowSource,
    };
  }

  async submitDescription(user: User, rawDescription: string): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.event_description) {
      return { status: 'not_in_event_flow' };
    }

    const payload = this.extractPayload(session?.payloadJson);
    const description = this.eventsService.validateEventDescription(rawDescription);

    if (!description) {
      return { status: 'invalid_description', source: payload.eventFlowSource };
    }

    if (payload.eventFlowSource === 'standalone') {
      await this.fsmService.setState(user.id, FSM_STATES.event_end_date, {
        ...this.withoutKeys(payload, ['eventEndDateKey']),
        eventDescription: description,
      });

      return {
        status: 'next',
        nextState: FSM_STATES.event_end_date,
        source: 'standalone',
      };
    }

    return this.complete(user, description);
  }

  async skipDescription(user: User): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.event_description) {
      return { status: 'not_in_event_flow' };
    }

    const payload = this.extractPayload(session?.payloadJson);

    if (payload.eventFlowSource === 'standalone') {
      await this.fsmService.setState(
        user.id,
        FSM_STATES.event_end_date,
        this.withoutKeys(payload, ['eventDescription', 'eventEndDateKey']),
      );

      return {
        status: 'next',
        nextState: FSM_STATES.event_end_date,
        source: 'standalone',
      };
    }

    return this.complete(user);
  }

  async submitEndDate(user: User, rawEndDate: string): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.event_end_date) {
      return { status: 'not_in_event_flow' };
    }

    const payload = this.extractPayload(session?.payloadJson);
    const eventStartDate = this.resolveEventStartDate(payload, user);

    if (!eventStartDate) {
      return { status: 'missing_context' };
    }

    const eventEndDate = this.eventsService.validateEventEndDate(rawEndDate, eventStartDate);

    if (!eventEndDate) {
      return { status: 'invalid_end_date', source: payload.eventFlowSource };
    }

    await this.fsmService.setState(user.id, FSM_STATES.event_end_date, {
      ...payload,
      eventEndDateKey: formatDateKey(eventEndDate),
    });

    return this.complete(user, payload.eventDescription);
  }

  async skipEndDate(user: User): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.event_end_date) {
      return { status: 'not_in_event_flow' };
    }

    const payload = this.extractPayload(session?.payloadJson);

    await this.fsmService.setState(
      user.id,
      FSM_STATES.event_end_date,
      this.withoutKeys(payload, ['eventEndDateKey', 'eventRepeatMode', 'eventRepeatCount', 'eventSeriesId']),
    );

    return this.complete(user);
  }

  async submitRepeatMode(user: User, rawRepeatMode: string): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.event_repeat_mode) {
      return { status: 'not_in_event_flow' };
    }

    void rawRepeatMode;
    const payload = this.extractPayload(session?.payloadJson);

    await this.fsmService.setState(
      user.id,
      FSM_STATES.event_end_date,
      this.withoutKeys(payload, ['eventRepeatMode', 'eventRepeatCount', 'eventSeriesId']),
    );

    return {
      status: 'next',
      nextState: FSM_STATES.event_end_date,
      source: payload.eventFlowSource,
    };
  }

  async submitRepeatCount(user: User, value: string | number): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (state !== FSM_STATES.event_repeat_count) {
      return { status: 'not_in_event_flow' };
    }

    void value;
    const payload = this.extractPayload(session?.payloadJson);

    await this.fsmService.setState(
      user.id,
      FSM_STATES.event_end_date,
      this.withoutKeys(payload, ['eventRepeatMode', 'eventRepeatCount', 'eventSeriesId']),
    );

    return {
      status: 'next',
      nextState: FSM_STATES.event_end_date,
      source: payload.eventFlowSource,
    };
  }

  async goBack(user: User): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = this.extractPayload(session?.payloadJson);

    switch (state) {
      case FSM_STATES.event_type: {
        if (payload.eventFlowSource === 'checkin') {
          await this.fsmService.setState(
            user.id,
            FSM_STATES.checkin_add_event_confirm,
            this.withoutKeys(payload, [
              'eventType',
              'eventTitle',
              'eventScore',
              'eventDescription',
              'eventEndDateKey',
            ]),
          );

          return {
            status: 'next',
            nextState: FSM_STATES.checkin_add_event_confirm,
            source: 'checkin',
          };
        }

        return { status: 'cannot_back' };
      }
      case FSM_STATES.event_title: {
        await this.fsmService.setState(
          user.id,
          FSM_STATES.event_type,
          this.withoutKeys(payload, ['eventTitle', 'eventScore', 'eventDescription', 'eventEndDateKey']),
        );

        return {
          status: 'next',
          nextState: FSM_STATES.event_type,
          source: payload.eventFlowSource,
        };
      }
      case FSM_STATES.event_score: {
        await this.fsmService.setState(
          user.id,
          FSM_STATES.event_title,
          this.withoutKeys(payload, ['eventScore', 'eventDescription', 'eventEndDateKey']),
        );

        return {
          status: 'next',
          nextState: FSM_STATES.event_title,
          source: payload.eventFlowSource,
        };
      }
      case FSM_STATES.event_description: {
        await this.fsmService.setState(
          user.id,
          FSM_STATES.event_score,
          this.withoutKeys(payload, ['eventDescription', 'eventEndDateKey']),
        );

        return {
          status: 'next',
          nextState: FSM_STATES.event_score,
          source: payload.eventFlowSource,
        };
      }
      case FSM_STATES.event_end_date: {
        await this.fsmService.setState(
          user.id,
          FSM_STATES.event_description,
          this.withoutKeys(payload, ['eventEndDateKey', 'eventRepeatMode', 'eventRepeatCount', 'eventSeriesId']),
        );

        return {
          status: 'next',
          nextState: FSM_STATES.event_description,
          source: payload.eventFlowSource,
        };
      }
      case FSM_STATES.event_repeat_mode: {
        await this.fsmService.setState(
          user.id,
          FSM_STATES.event_end_date,
          this.withoutKeys(payload, ['eventRepeatMode', 'eventRepeatCount', 'eventSeriesId']),
        );

        return {
          status: 'next',
          nextState: FSM_STATES.event_end_date,
          source: payload.eventFlowSource,
        };
      }
      case FSM_STATES.event_repeat_count: {
        await this.fsmService.setState(
          user.id,
          FSM_STATES.event_end_date,
          this.withoutKeys(payload, ['eventRepeatMode', 'eventRepeatCount', 'eventSeriesId']),
        );

        return {
          status: 'next',
          nextState: FSM_STATES.event_end_date,
          source: payload.eventFlowSource,
        };
      }
      default:
        return { status: 'not_in_event_flow' };
    }
  }

  private async complete(user: User, description?: string): Promise<EventFlowResult> {
    const session = await this.fsmService.getSession(user.id);
    const state = (session?.state as FsmState | undefined) ?? FSM_STATES.idle;

    if (
      state !== FSM_STATES.event_description &&
      state !== FSM_STATES.event_end_date &&
      state !== FSM_STATES.event_repeat_mode &&
      state !== FSM_STATES.event_repeat_count
    ) {
      return { status: 'not_in_event_flow' };
    }

    const payload = this.extractPayload(session?.payloadJson);

    if (!payload.eventType || !payload.eventTitle || typeof payload.eventScore !== 'number') {
      return { status: 'missing_context' };
    }

    const eventStartDate = this.resolveEventStartDate(payload, user);

    if (!eventStartDate) {
      return { status: 'missing_context' };
    }

    const eventDescription = description ?? payload.eventDescription;
    const event = await this.eventsService.createEvent(user.id, {
      eventType: payload.eventType,
      title: payload.eventTitle,
      eventScore: payload.eventScore,
      eventDate: eventStartDate.toISOString(),
      eventEndDate: payload.eventEndDateKey
        ? this.eventsService.buildEventDateFromDayKey(payload.eventEndDateKey).toISOString()
        : undefined,
      description: eventDescription,
    });

    if (payload.eventFlowSource === 'checkin' && payload.entryId) {
      await this.eventsService.linkEventToEntry(event.id, payload.entryId);
    }

    await this.analyticsService.track(
      'event_created',
      {
        eventId: event.id,
        source: payload.eventFlowSource,
        eventType: payload.eventType,
        eventsCount: 1,
      },
      user.id,
    );

    if (payload.eventFlowSource === 'checkin') {
      const finalizedPayload: CheckinDraftPayload = {
        ...payload,
        eventAdded: true,
      };

      await this.fsmService.setIdle(user.id);

      return {
        status: 'created',
        source: 'checkin',
        checkinPayload: finalizedPayload,
        createdEventsCount: 1,
      };
    }

    await this.fsmService.setIdle(user.id);

    return {
      status: 'created',
      source: 'standalone',
      createdEventsCount: 1,
    };
  }

  private extractPayload(payload: unknown): CheckinDraftPayload {
    if (!payload || typeof payload !== 'object') {
      return {};
    }

    const typedPayload = payload as CheckinDraftPayload;
    const source = typedPayload.eventFlowSource;

    if (source === 'checkin' || source === 'standalone') {
      return typedPayload;
    }

    return {
      ...typedPayload,
      eventFlowSource: undefined,
    };
  }

  private withoutKeys(payload: CheckinDraftPayload, keys: Array<keyof CheckinDraftPayload>): CheckinDraftPayload {
    const next = { ...payload };

    for (const key of keys) {
      delete next[key];
    }

    return next;
  }

  private resolveEventStartDate(payload: CheckinDraftPayload, user: User): Date | null {
    const dayKey = payload.eventStartDateKey ?? payload.entryDateKey;

    if (dayKey) {
      return this.eventsService.buildEventDateFromDayKey(dayKey);
    }

    if (payload.eventFlowSource === 'standalone') {
      return this.eventsService.buildEventDate(new Date(), user.timezone);
    }

    return null;
  }
}
