import { Injectable } from '@nestjs/common';
import { Prisma, type Event } from '@prisma/client';

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

  findByUserAndSeriesId(userId: string, seriesId: string): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: {
        userId,
        seriesId,
      },
      orderBy: [{ seriesPosition: 'asc' }, { eventDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createRepeatedSeries(
    userId: string,
    data: Prisma.EventUncheckedCreateInput[],
    seriesId: string,
    totalOccurrences: number,
  ): Promise<Event[]> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.event.findMany({
          where: {
            userId,
            seriesId,
          },
          orderBy: [{ seriesPosition: 'asc' }, { eventDate: 'asc' }, { createdAt: 'asc' }],
        });

        if (existing.length > 0) {
          if (this.isCommittedSeries(existing, totalOccurrences)) {
            return existing;
          }

          throw new Error('EVENT_SERIES_INCOMPLETE');
        }

        await tx.event.createMany({
          data,
        });

        return tx.event.findMany({
          where: {
            userId,
            seriesId,
          },
          orderBy: [{ seriesPosition: 'asc' }, { eventDate: 'asc' }, { createdAt: 'asc' }],
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findByUserAndSeriesId(userId, seriesId);

        if (this.isCommittedSeries(existing, totalOccurrences)) {
          return existing;
        }
      }

      throw error;
    }
  }

  findByUserAndDay(userId: string, eventDate: Date): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: {
        userId,
        seriesId: null,
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
        seriesId: null,
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

  private isCommittedSeries(events: Event[], totalOccurrences: number): boolean {
    if (events.length !== totalOccurrences) {
      return false;
    }

    return events.every(
      (event, index) => event.seriesPosition === index + 1 && !!event.seriesId,
    );
  }
}
