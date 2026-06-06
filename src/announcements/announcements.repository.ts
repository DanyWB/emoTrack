import { Injectable } from '@nestjs/common';
import {
  AnnouncementDeliveryStatus,
  AnnouncementStatus,
  AnnouncementType,
  type AnnouncementCampaign,
  type AnnouncementDelivery,
  type AnnouncementPollOption,
  type AnnouncementPollVote,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import type { AnnouncementDeliveryCounts } from './announcements.types';

export type AnnouncementCampaignWithOptions = Prisma.AnnouncementCampaignGetPayload<{
  include: {
    pollOptions: true;
  };
}>;

export type AnnouncementCampaignDetail = Prisma.AnnouncementCampaignGetPayload<{
  include: {
    pollOptions: true;
    _count: {
      select: {
        deliveries: true;
        pollVotes: true;
      };
    };
  };
}>;

export type AnnouncementDeliveryWithCampaign = Prisma.AnnouncementDeliveryGetPayload<{
  include: {
    campaign: {
      include: {
        pollOptions: true;
      };
    };
  };
}>;

export interface AnnouncementCampaignPage {
  items: AnnouncementCampaignDetail[];
  total: number;
  offset: number;
  limit: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface AnnouncementAudienceUser {
  id: string;
  telegramId: bigint;
}

@Injectable()
export class AnnouncementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createCampaign(data: {
    type: AnnouncementType;
    createdByAdminTelegramId: bigint;
    pollToken?: string | null;
  }): Promise<AnnouncementCampaign> {
    return this.prisma.announcementCampaign.create({
      data: {
        type: data.type,
        createdByAdminTelegramId: data.createdByAdminTelegramId,
        pollToken: data.pollToken ?? null,
      },
    });
  }

  findCampaignWithOptions(id: string): Promise<AnnouncementCampaignWithOptions | null> {
    return this.prisma.announcementCampaign.findUnique({
      where: { id },
      include: {
        pollOptions: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  findCampaignDetail(id: string): Promise<AnnouncementCampaignDetail | null> {
    return this.prisma.announcementCampaign.findUnique({
      where: { id },
      include: {
        pollOptions: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            deliveries: true,
            pollVotes: true,
          },
        },
      },
    });
  }

  findCampaignByPollToken(pollToken: string): Promise<AnnouncementCampaignWithOptions | null> {
    return this.prisma.announcementCampaign.findUnique({
      where: { pollToken },
      include: {
        pollOptions: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async listCampaigns(options: { offset: number; limit: number }): Promise<AnnouncementCampaignPage> {
    const offset = Math.max(0, options.offset);
    const limit = Math.min(Math.max(1, options.limit), 10);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.announcementCampaign.findMany({
        include: {
          pollOptions: {
            orderBy: { sortOrder: 'asc' },
          },
          _count: {
            select: {
              deliveries: true,
              pollVotes: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.announcementCampaign.count(),
    ]);

    return {
      items,
      total,
      offset,
      limit,
      hasPrevious: offset > 0,
      hasNext: offset + items.length < total,
    };
  }

  updateCampaign(
    id: string,
    data: Prisma.AnnouncementCampaignUpdateInput,
  ): Promise<AnnouncementCampaign> {
    return this.prisma.announcementCampaign.update({
      where: { id },
      data,
    });
  }

  async replacePollOptions(
    campaignId: string,
    labels: string[],
  ): Promise<AnnouncementPollOption[]> {
    await this.prisma.$transaction([
      this.prisma.announcementPollOption.deleteMany({
        where: { campaignId },
      }),
      this.prisma.announcementPollOption.createMany({
        data: labels.map((label, index) => ({
          campaignId,
          label,
          sortOrder: index + 1,
        })),
      }),
    ]);

    return this.prisma.announcementPollOption.findMany({
      where: { campaignId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  countConsentedAudience(): Promise<number> {
    return this.prisma.user.count({
      where: {
        consentGiven: true,
      },
    });
  }

  findConsentedAudienceUsers(): Promise<AnnouncementAudienceUser[]> {
    return this.prisma.user.findMany({
      where: {
        consentGiven: true,
      },
      select: {
        id: true,
        telegramId: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  findConsentedAudienceUsersPage(options: {
    afterId?: string;
    limit: number;
  }): Promise<AnnouncementAudienceUser[]> {
    return this.prisma.user.findMany({
      where: {
        consentGiven: true,
      },
      select: {
        id: true,
        telegramId: true,
      },
      orderBy: {
        id: 'asc',
      },
      ...(options.afterId ? { cursor: { id: options.afterId }, skip: 1 } : {}),
      take: options.limit,
    });
  }

  async createAudienceDeliveries(
    campaignId: string,
    users: AnnouncementAudienceUser[],
  ): Promise<void> {
    if (users.length === 0) {
      return;
    }

    await this.prisma.announcementDelivery.createMany({
      data: users.map((user) => ({
        campaignId,
        userId: user.id,
        telegramId: user.telegramId,
      })),
      skipDuplicates: true,
    });
  }

  findPendingDeliveries(campaignId: string): Promise<AnnouncementDelivery[]> {
    return this.prisma.announcementDelivery.findMany({
      where: {
        campaignId,
        status: AnnouncementDeliveryStatus.pending,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  findPendingDeliveriesPage(
    campaignId: string,
    options: {
      afterId?: string;
      limit: number;
    },
  ): Promise<AnnouncementDelivery[]> {
    return this.prisma.announcementDelivery.findMany({
      where: {
        campaignId,
        status: AnnouncementDeliveryStatus.pending,
      },
      orderBy: {
        id: 'asc',
      },
      ...(options.afterId ? { cursor: { id: options.afterId }, skip: 1 } : {}),
      take: options.limit,
    });
  }

  findDeliveryWithCampaign(id: string): Promise<AnnouncementDeliveryWithCampaign | null> {
    return this.prisma.announcementDelivery.findUnique({
      where: { id },
      include: {
        campaign: {
          include: {
            pollOptions: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });
  }

  updateDeliverySent(
    id: string,
    messageIds: number[],
  ): Promise<AnnouncementDelivery> {
    return this.prisma.announcementDelivery.update({
      where: { id },
      data: {
        status: AnnouncementDeliveryStatus.sent,
        telegramMessageIds: messageIds,
        errorCode: null,
        errorMessage: null,
        attempts: { increment: 1 },
        sentAt: new Date(),
      },
    });
  }

  markDeliveryAttemptFailed(
    id: string,
    error: { code?: string; message?: string },
  ): Promise<AnnouncementDelivery> {
    return this.prisma.announcementDelivery.update({
      where: { id },
      data: {
        errorCode: error.code ?? null,
        errorMessage: error.message ?? null,
        attempts: { increment: 1 },
      },
    });
  }

  updateDeliveryFailed(
    id: string,
    status: Extract<AnnouncementDeliveryStatus, 'failed' | 'blocked'>,
    error: { code?: string; message?: string },
  ): Promise<AnnouncementDelivery> {
    return this.prisma.announcementDelivery.update({
      where: { id },
      data: {
        status,
        errorCode: error.code ?? null,
        errorMessage: error.message ?? null,
        attempts: { increment: 1 },
      },
    });
  }

  async getDeliveryCounts(campaignId: string): Promise<AnnouncementDeliveryCounts> {
    const grouped = await this.prisma.announcementDelivery.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: {
        _all: true,
      },
    });
    const counts: AnnouncementDeliveryCounts = {
      pending: 0,
      sent: 0,
      failed: 0,
      blocked: 0,
    };

    for (const item of grouped) {
      counts[item.status] = item._count._all;
    }

    return counts;
  }

  findExistingVote(campaignId: string, userId: string): Promise<AnnouncementPollVote | null> {
    return this.prisma.announcementPollVote.findUnique({
      where: {
        campaignId_userId: {
          campaignId,
          userId,
        },
      },
    });
  }

  createPollVote(data: {
    campaignId: string;
    optionId: string;
    userId: string;
  }): Promise<AnnouncementPollVote> {
    return this.prisma.announcementPollVote.create({
      data,
    });
  }

  async getPollVoteCounts(campaignId: string): Promise<Map<string, number>> {
    const grouped = await this.prisma.announcementPollVote.groupBy({
      by: ['optionId'],
      where: { campaignId },
      _count: {
        _all: true,
      },
    });

    return new Map(grouped.map((item) => [item.optionId, item._count._all]));
  }

  markCampaignReady(id: string): Promise<AnnouncementCampaign> {
    return this.updateCampaign(id, {
      status: AnnouncementStatus.ready,
    });
  }

  async claimCampaignForSending(id: string): Promise<boolean> {
    const result = await this.prisma.announcementCampaign.updateMany({
      where: {
        id,
        status: {
          in: [AnnouncementStatus.draft, AnnouncementStatus.ready],
        },
      },
      data: {
        status: AnnouncementStatus.sending,
        confirmedAt: new Date(),
        startedAt: new Date(),
        finishedAt: null,
      },
    });

    return result.count === 1;
  }

  async claimStaleSendingCampaign(id: string, staleBefore: Date): Promise<boolean> {
    const result = await this.prisma.announcementCampaign.updateMany({
      where: {
        id,
        status: AnnouncementStatus.sending,
        OR: [
          { startedAt: null },
          { startedAt: { lte: staleBefore } },
        ],
      },
      data: {
        startedAt: new Date(),
        finishedAt: null,
      },
    });

    return result.count === 1;
  }

  markCampaignSending(id: string): Promise<AnnouncementCampaign> {
    return this.updateCampaign(id, {
      status: AnnouncementStatus.sending,
      confirmedAt: new Date(),
      startedAt: new Date(),
    });
  }

  markCampaignFinished(
    id: string,
    status: Extract<AnnouncementStatus, 'sent' | 'partially_failed' | 'failed'>,
  ): Promise<AnnouncementCampaign> {
    return this.updateCampaign(id, {
      status,
      finishedAt: new Date(),
    });
  }

  cancelCampaign(id: string): Promise<AnnouncementCampaign> {
    return this.updateCampaign(id, {
      status: AnnouncementStatus.cancelled,
      finishedAt: new Date(),
    });
  }
}
