import { Injectable } from '@nestjs/common';
import { type FsmSession, type Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import type { FsmPayload, FsmState } from './fsm.types';

@Injectable()
export class FsmRepository {
  constructor(private readonly prisma: PrismaService) {}

  getByUserId(userId: string): Promise<FsmSession | null> {
    return this.prisma.fsmSession.findUnique({
      where: { userId },
    });
  }

  upsert(userId: string, state: FsmState, payloadJson: FsmPayload): Promise<FsmSession> {
    return this.prisma.fsmSession.upsert({
      where: { userId },
      create: {
        userId,
        state,
        payloadJson: payloadJson as Prisma.InputJsonValue,
      },
      update: {
        state,
        payloadJson: payloadJson as Prisma.InputJsonValue,
      },
    });
  }

  deleteByUserId(userId: string): Promise<FsmSession> {
    return this.prisma.fsmSession.delete({
      where: { userId },
    });
  }
}
