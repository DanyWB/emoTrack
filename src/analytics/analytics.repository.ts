import { Injectable } from '@nestjs/common';
import { type Prisma, type ProductEvent } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(eventName: string, payloadJson: Record<string, unknown>, userId?: string): Promise<ProductEvent> {
    return this.prisma.productEvent.create({
      data: {
        userId,
        eventName,
        payloadJson: payloadJson as Prisma.InputJsonValue,
      },
    });
  }
}
