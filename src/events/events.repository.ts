import { Injectable } from '@nestjs/common';
import type { Event, Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.EventUncheckedCreateInput): Promise<Event> {
    return this.prisma.event.create({ data });
  }

  update(eventId: string, data: Prisma.EventUpdateInput): Promise<Event> {
    return this.prisma.event.update({
      where: { id: eventId },
      data,
    });
  }
}
