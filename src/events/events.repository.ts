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

  findByUserAndDay(userId: string, eventDate: Date): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: {
        userId,
        eventDate: {
          lte: eventDate,
        },
        OR: [
          {
            eventEndDate: null,
            eventDate: {
              gte: eventDate,
            },
          },
          {
            eventEndDate: {
              gte: eventDate,
            },
          },
        ],
      },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findByUserAndPeriod(userId: string, from: Date, to: Date): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: {
        userId,
        eventDate: {
          lte: to,
        },
        OR: [
          {
            eventEndDate: null,
            eventDate: {
              gte: from,
            },
          },
          {
            eventEndDate: {
              gte: from,
            },
          },
        ],
      },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
