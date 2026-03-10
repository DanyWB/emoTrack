import { Injectable } from '@nestjs/common';

import { FsmRepository } from './fsm.repository';
import { FSM_STATES, type FsmPayload, type FsmState } from './fsm.types';

@Injectable()
export class FsmService {
  constructor(private readonly fsmRepository: FsmRepository) {}

  getSession(userId: string) {
    return this.fsmRepository.getByUserId(userId);
  }

  async setState(userId: string, state: FsmState, payload: FsmPayload = {}): Promise<void> {
    await this.fsmRepository.upsert(userId, state, payload);
  }

  async updatePayload(userId: string, patch: FsmPayload): Promise<void> {
    const current = await this.getSession(userId);
    const state = (current?.state as FsmState | undefined) ?? FSM_STATES.idle;
    const payload = {
      ...(current?.payloadJson as FsmPayload | undefined),
      ...patch,
    };

    await this.fsmRepository.upsert(userId, state, payload);
  }

  async clearSession(userId: string): Promise<void> {
    const existing = await this.getSession(userId);

    if (existing) {
      await this.fsmRepository.deleteByUserId(userId);
    }
  }

  async setIdle(userId: string): Promise<void> {
    await this.setState(userId, FSM_STATES.idle, {});
  }

  async getState(userId: string): Promise<FsmState> {
    const session = await this.getSession(userId);
    return (session?.state as FsmState | undefined) ?? FSM_STATES.idle;
  }
}
