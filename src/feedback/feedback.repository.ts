import { Injectable } from '@nestjs/common';
import type { FeedbackItem, FeedbackStatus, FeedbackType, Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

export type FeedbackItemWithUser = Prisma.FeedbackItemGetPayload<{
  include: {
    user: true;
  };
}>;

@Injectable()
export class FeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    feedbackType: FeedbackType;
    message: string;
  }): Promise<FeedbackItem> {
    return this.prisma.feedbackItem.create({
      data,
    });
  }

  findById(id: string): Promise<FeedbackItemWithUser | null> {
    return this.prisma.feedbackItem.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });
  }

  async list(options: {
    offset: number;
    limit: number;
    status?: FeedbackStatus;
  }): Promise<{ items: FeedbackItemWithUser[]; total: number }> {
    const offset = Math.max(0, options.offset);
    const limit = Math.min(Math.max(1, options.limit), 20);
    const where = options.status ? { status: options.status } : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.feedbackItem.findMany({
        where,
        include: {
          user: true,
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.feedbackItem.count({ where }),
    ]);

    return { items, total };
  }

  markReviewed(id: string): Promise<FeedbackItem> {
    return this.prisma.feedbackItem.update({
      where: { id },
      data: { status: 'reviewed' },
    });
  }
}
