import { AnnouncementDeliveryStatus, AnnouncementStatus, AnnouncementType } from '@prisma/client';

import { TELEGRAM_CALLBACKS } from '../../src/common/constants/app.constants';
import { AnnouncementsService } from '../../src/announcements/announcements.service';
import { telegramCopy } from '../../src/telegram/telegram.copy';
import { buildUser, createConfigService } from '../helpers/in-memory';

describe('AnnouncementsService', () => {
  function createService(
    overrides: Record<string, unknown> = {},
    configOverrides: Record<string, unknown> = {},
    queue?: { addBulk: jest.Mock; add: jest.Mock },
  ) {
    const repository = {
      createCampaign: jest.fn(),
      findCampaignWithOptions: jest.fn(),
      findCampaignDetail: jest.fn(),
      findCampaignByPollToken: jest.fn(),
      listCampaigns: jest.fn(),
      updateCampaign: jest.fn(),
      replacePollOptions: jest.fn(),
      countConsentedAudience: jest.fn(),
      findConsentedAudienceUsers: jest.fn(),
      findConsentedAudienceUsersPage: jest.fn(),
      createAudienceDeliveries: jest.fn(),
      findPendingDeliveries: jest.fn(),
      findPendingDeliveriesPage: jest.fn(),
      findDeliveryWithCampaign: jest.fn(),
      updateDeliverySent: jest.fn(),
      markDeliveryAttemptFailed: jest.fn(),
      updateDeliveryFailed: jest.fn(),
      getDeliveryCounts: jest.fn(),
      findExistingVote: jest.fn(),
      createPollVote: jest.fn(),
      getPollVoteCounts: jest.fn(),
      markCampaignReady: jest.fn(),
      claimCampaignForSending: jest.fn().mockResolvedValue(true),
      claimStaleSendingCampaign: jest.fn().mockResolvedValue(false),
      markCampaignSending: jest.fn(),
      markCampaignFinished: jest.fn(),
      cancelCampaign: jest.fn(),
      ...overrides,
    };
    const service = new AnnouncementsService(
      repository as never,
      createConfigService({
        telegram: { botToken: '123:test-token' },
        ...configOverrides,
      }),
      queue as never,
    );
    const telegramApi = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 44 }),
      sendPhoto: jest.fn().mockResolvedValue({ message_id: 43 }),
    };

    Object.assign(service, {
      telegramApi,
      telegramEnabled: true,
    });

    return { service, repository, telegramApi };
  }

  const baseCampaign = {
    id: 'announcement-1',
    type: AnnouncementType.poll,
    title: 'Новый раздел',
    body: 'Расскажи, что важнее улучшить дальше.',
    audience: 'consented',
    status: AnnouncementStatus.ready,
    createdByAdminTelegramId: 123n,
    imageTelegramFileId: null,
    imageTelegramFileUniqueId: null,
    imageAddedAt: null,
    pollToken: 'abc123',
    createdAt: new Date('2026-06-06T10:00:00.000Z'),
    updatedAt: new Date('2026-06-06T10:00:00.000Z'),
    confirmedAt: null,
    startedAt: null,
    finishedAt: null,
    pollOptions: [
      {
        id: 'option-1',
        campaignId: 'announcement-1',
        label: 'Статистика',
        sortOrder: 1,
        createdAt: new Date('2026-06-06T10:00:00.000Z'),
      },
      {
        id: 'option-2',
        campaignId: 'announcement-1',
        label: 'История',
        sortOrder: 2,
        createdAt: new Date('2026-06-06T10:00:00.000Z'),
      },
    ],
  };

  it('validates text fields and poll options before writing', () => {
    const { service } = createService();

    expect(service.validateTitle('  Заголовок  ')).toBe('Заголовок');
    expect(service.validateTitle('x'.repeat(81))).toBeNull();
    expect(service.validateBody('  Текст  ')).toBe('Текст');
    expect(service.validateBody('x'.repeat(1201))).toBeNull();
    expect(service.parsePollOptions('Да\nНет')).toEqual(['Да', 'Нет']);
    expect(service.parsePollOptions('Да\nда')).toBeNull();
    expect(service.parsePollOptions('Только один')).toBeNull();
    expect(service.parsePollOptions('1. Yes\n24/7 support')).toEqual(['Yes', '24/7 support']);
  });

  it('sends a ready poll announcement only to repository-selected consented audience', async () => {
    const delivery = {
      id: 'delivery-1',
      campaignId: 'announcement-1',
      userId: 'user-1',
      telegramId: 8901n,
      status: AnnouncementDeliveryStatus.pending,
      telegramMessageIds: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      sentAt: null,
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
      updatedAt: new Date('2026-06-06T10:00:00.000Z'),
    };
    const { service, repository, telegramApi } = createService();

    repository.findCampaignWithOptions.mockResolvedValue(baseCampaign);
    repository.countConsentedAudience.mockResolvedValue(1);
    repository.findConsentedAudienceUsers.mockResolvedValue([
      { id: 'user-1', telegramId: 8901n },
    ]);
    repository.findPendingDeliveries.mockResolvedValue([delivery]);
    repository.getDeliveryCounts.mockResolvedValue({
      pending: 0,
      sent: 1,
      failed: 0,
      blocked: 0,
    });

    await expect(service.sendCampaign('announcement-1')).resolves.toMatchObject({
      audienceCount: 1,
      deliveryCounts: {
        sent: 1,
      },
    });

    expect(repository.createAudienceDeliveries).toHaveBeenCalledWith('announcement-1', [
      { id: 'user-1', telegramId: 8901n },
    ]);
    expect(telegramApi.sendMessage).toHaveBeenCalledWith(
      '8901',
      expect.stringContaining('Новый раздел'),
      expect.objectContaining({
        parse_mode: 'HTML',
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({
                callback_data: `${TELEGRAM_CALLBACKS.announcementVotePrefix}abc123:1`,
              }),
            ]),
          ]),
        }),
      }),
    );
    expect(repository.updateDeliverySent).toHaveBeenCalledWith('delivery-1', [44]);
    expect(repository.markCampaignFinished).toHaveBeenCalledWith('announcement-1', AnnouncementStatus.sent);
  });

  it('does not claim or mutate a ready announcement when the consented audience is empty', async () => {
    const { service, repository, telegramApi } = createService();

    repository.findCampaignWithOptions.mockResolvedValue(baseCampaign);
    repository.countConsentedAudience.mockResolvedValue(0);

    await expect(service.sendCampaign('announcement-1')).resolves.toMatchObject({
      audienceCount: 0,
      queued: false,
      skippedReason: 'no_audience',
      deliveryCounts: {
        pending: 0,
        sent: 0,
        failed: 0,
        blocked: 0,
      },
    });

    expect(repository.claimCampaignForSending).not.toHaveBeenCalled();
    expect(repository.findConsentedAudienceUsers).not.toHaveBeenCalled();
    expect(repository.createAudienceDeliveries).not.toHaveBeenCalled();
    expect(repository.markCampaignFinished).not.toHaveBeenCalled();
    expect(telegramApi.sendMessage).not.toHaveBeenCalled();
  });

  it('does not send if another process already claimed the announcement', async () => {
    const { service, repository, telegramApi } = createService();

    repository.findCampaignWithOptions.mockResolvedValue(baseCampaign);
    repository.countConsentedAudience.mockResolvedValue(1);
    repository.claimCampaignForSending.mockResolvedValue(false);

    await expect(service.sendCampaign('announcement-1')).resolves.toBeNull();

    expect(repository.findConsentedAudienceUsers).not.toHaveBeenCalled();
    expect(repository.createAudienceDeliveries).not.toHaveBeenCalled();
    expect(telegramApi.sendMessage).not.toHaveBeenCalled();
    expect(repository.markCampaignFinished).not.toHaveBeenCalled();
  });

  it('can resume a stale sending announcement without duplicating existing deliveries', async () => {
    const staleCampaign = {
      ...baseCampaign,
      status: AnnouncementStatus.sending,
      startedAt: new Date('2020-01-01T00:00:00.000Z'),
    };
    const delivery = {
      id: 'delivery-stale-1',
      campaignId: 'announcement-1',
      userId: 'user-1',
      telegramId: 8901n,
      status: AnnouncementDeliveryStatus.pending,
      telegramMessageIds: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      sentAt: null,
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
      updatedAt: new Date('2026-06-06T10:00:00.000Z'),
    };
    const { service, repository } = createService();

    repository.findCampaignWithOptions.mockResolvedValue(staleCampaign);
    repository.countConsentedAudience.mockResolvedValue(1);
    repository.claimStaleSendingCampaign.mockResolvedValue(true);
    repository.findConsentedAudienceUsers.mockResolvedValue([{ id: 'user-1', telegramId: 8901n }]);
    repository.findPendingDeliveries.mockResolvedValue([delivery]);
    repository.getDeliveryCounts.mockResolvedValue({
      pending: 0,
      sent: 1,
      failed: 0,
      blocked: 0,
    });

    await expect(service.sendCampaign('announcement-1')).resolves.toMatchObject({
      audienceCount: 1,
    });

    expect(repository.claimCampaignForSending).not.toHaveBeenCalled();
    expect(repository.claimStaleSendingCampaign).toHaveBeenCalledWith('announcement-1', expect.any(Date));
    expect(repository.createAudienceDeliveries).toHaveBeenCalledWith('announcement-1', [
      { id: 'user-1', telegramId: 8901n },
    ]);
  });

  it('queues pending deliveries when background jobs are enabled', async () => {
    const delivery = {
      id: 'delivery-queue-1',
      campaignId: 'announcement-1',
      userId: 'user-1',
      telegramId: 8901n,
      status: AnnouncementDeliveryStatus.pending,
      telegramMessageIds: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      sentAt: null,
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
      updatedAt: new Date('2026-06-06T10:00:00.000Z'),
    };
    const queue = {
      addBulk: jest.fn().mockResolvedValue([]),
      add: jest.fn().mockResolvedValue({}),
    };
    const { service, repository, telegramApi } = createService(
      {},
      { app: { jobsEnabled: true } },
      queue,
    );

    repository.findCampaignWithOptions.mockResolvedValue(baseCampaign);
    repository.countConsentedAudience.mockResolvedValue(1);
    repository.findConsentedAudienceUsersPage.mockResolvedValueOnce([{ id: 'user-1', telegramId: 8901n }]);
    repository.findPendingDeliveriesPage.mockResolvedValueOnce([delivery]);
    repository.getDeliveryCounts.mockResolvedValue({
      pending: 1,
      sent: 0,
      failed: 0,
      blocked: 0,
    });

    await expect(service.sendCampaign('announcement-1')).resolves.toMatchObject({
      queued: true,
      audienceCount: 1,
      deliveryCounts: {
        pending: 1,
      },
    });

    expect(telegramApi.sendMessage).not.toHaveBeenCalled();
    expect(repository.findConsentedAudienceUsers).not.toHaveBeenCalled();
    expect(repository.findPendingDeliveries).not.toHaveBeenCalled();
    expect(queue.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'send-delivery',
        data: { deliveryId: 'delivery-queue-1' },
        opts: expect.objectContaining({
          jobId: 'announcement:delivery:delivery-queue-1',
          attempts: 4,
        }),
      }),
    ]);
    expect(queue.add).toHaveBeenCalledWith(
      'finalize-campaign',
      { campaignId: 'announcement-1' },
      expect.objectContaining({
        delay: expect.any(Number),
      }),
    );
  });

  it('creates and queues announcement deliveries in pages for large audiences', async () => {
    const usersPageOne = Array.from({ length: 1000 }, (_, index) => ({
      id: `user-${String(index).padStart(4, '0')}`,
      telegramId: BigInt(9000 + index),
    }));
    const usersPageTwo = [{ id: 'user-1000', telegramId: 10000n }];
    const deliveriesPageOne = Array.from({ length: 500 }, (_, index) => ({
      id: `delivery-${String(index).padStart(4, '0')}`,
      campaignId: 'announcement-1',
      userId: `user-${index}`,
      telegramId: BigInt(9000 + index),
      status: AnnouncementDeliveryStatus.pending,
      telegramMessageIds: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      sentAt: null,
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
      updatedAt: new Date('2026-06-06T10:00:00.000Z'),
    }));
    const deliveriesPageTwo = Array.from({ length: 500 }, (_, index) => ({
      id: `delivery-${String(500 + index).padStart(4, '0')}`,
      campaignId: 'announcement-1',
      userId: `user-${500 + index}`,
      telegramId: BigInt(9500 + index),
      status: AnnouncementDeliveryStatus.pending,
      telegramMessageIds: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      sentAt: null,
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
      updatedAt: new Date('2026-06-06T10:00:00.000Z'),
    }));
    const deliveriesPageThree = [{
      id: 'delivery-1000',
      campaignId: 'announcement-1',
      userId: 'user-1000',
      telegramId: 10000n,
      status: AnnouncementDeliveryStatus.pending,
      telegramMessageIds: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      sentAt: null,
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
      updatedAt: new Date('2026-06-06T10:00:00.000Z'),
    }];
    const queue = {
      addBulk: jest.fn().mockResolvedValue([]),
      add: jest.fn().mockResolvedValue({}),
    };
    const { service, repository } = createService(
      {},
      { app: { jobsEnabled: true } },
      queue,
    );

    repository.findCampaignWithOptions.mockResolvedValue(baseCampaign);
    repository.countConsentedAudience.mockResolvedValue(1001);
    repository.findConsentedAudienceUsersPage
      .mockResolvedValueOnce(usersPageOne)
      .mockResolvedValueOnce(usersPageTwo);
    repository.findPendingDeliveriesPage
      .mockResolvedValueOnce(deliveriesPageOne)
      .mockResolvedValueOnce(deliveriesPageTwo)
      .mockResolvedValueOnce(deliveriesPageThree);
    repository.getDeliveryCounts.mockResolvedValue({
      pending: 1001,
      sent: 0,
      failed: 0,
      blocked: 0,
    });

    await expect(service.sendCampaign('announcement-1')).resolves.toMatchObject({
      queued: true,
      audienceCount: 1001,
    });

    expect(repository.createAudienceDeliveries).toHaveBeenCalledTimes(2);
    expect(queue.addBulk).toHaveBeenCalledTimes(3);
    expect(queue.addBulk).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          data: { deliveryId: 'delivery-0000' },
        }),
      ]),
    );
    expect(queue.addBulk).toHaveBeenNthCalledWith(
      3,
      expect.arrayContaining([
        expect.objectContaining({
          data: { deliveryId: 'delivery-1000' },
        }),
      ]),
    );
  });

  it('keeps transient delivery failures pending for BullMQ retry before the final attempt', async () => {
    const delivery = {
      id: 'delivery-retry-1',
      campaignId: 'announcement-1',
      userId: 'user-1',
      telegramId: 8901n,
      status: AnnouncementDeliveryStatus.pending,
      telegramMessageIds: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      sentAt: null,
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
      updatedAt: new Date('2026-06-06T10:00:00.000Z'),
      campaign: {
        ...baseCampaign,
        status: AnnouncementStatus.sending,
      },
    };
    const { service, repository, telegramApi } = createService();
    const error = new Error('Too Many Requests');

    repository.findDeliveryWithCampaign.mockResolvedValue(delivery);
    repository.markDeliveryAttemptFailed.mockResolvedValue({ ...delivery, attempts: 1 });
    telegramApi.sendMessage.mockRejectedValue(error);

    await expect(service.processDeliveryJob('delivery-retry-1', { finalAttempt: false })).rejects.toThrow(error);

    expect(repository.markDeliveryAttemptFailed).toHaveBeenCalledWith('delivery-retry-1', {
      code: undefined,
      message: 'Too Many Requests',
    });
    expect(repository.updateDeliveryFailed).not.toHaveBeenCalled();
  });

  it('sends image announcements as Telegram photos with HTML captions', async () => {
    const campaign = {
      ...baseCampaign,
      type: AnnouncementType.update,
      imageTelegramFileId: 'photo-file-id',
      pollToken: null,
      pollOptions: [],
    };
    const delivery = {
      id: 'delivery-image-1',
      campaignId: campaign.id,
      userId: 'user-1',
      telegramId: 8901n,
      status: AnnouncementDeliveryStatus.pending,
      telegramMessageIds: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      sentAt: null,
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
      updatedAt: new Date('2026-06-06T10:00:00.000Z'),
    };
    const { service, repository, telegramApi } = createService();

    repository.findCampaignWithOptions.mockResolvedValue(campaign);
    repository.countConsentedAudience.mockResolvedValue(1);
    repository.findConsentedAudienceUsers.mockResolvedValue([{ id: 'user-1', telegramId: 8901n }]);
    repository.findPendingDeliveries.mockResolvedValue([delivery]);
    repository.getDeliveryCounts.mockResolvedValue({
      pending: 0,
      sent: 1,
      failed: 0,
      blocked: 0,
    });

    await service.sendCampaign(campaign.id);

    expect(telegramApi.sendPhoto).toHaveBeenCalledWith(
      '8901',
      'photo-file-id',
      expect.objectContaining({
        caption: expect.stringContaining('Новый раздел'),
        parse_mode: 'HTML',
      }),
    );
    expect(repository.updateDeliverySent).toHaveBeenCalledWith('delivery-image-1', [43]);
  });

  it('records one poll vote per consented user', async () => {
    const { service, repository } = createService();
    const user = buildUser({
      id: 'user-1',
      telegramId: 8901n,
      consentGiven: true,
      onboardingCompleted: false,
    });

    repository.findCampaignByPollToken.mockResolvedValue({
      ...baseCampaign,
      status: AnnouncementStatus.sent,
    });
    repository.findExistingVote.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'vote-1',
      campaignId: 'announcement-1',
      optionId: 'option-1',
      userId: 'user-1',
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
    });
    repository.createPollVote.mockResolvedValue({
      id: 'vote-1',
      campaignId: 'announcement-1',
      optionId: 'option-1',
      userId: 'user-1',
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
    });

    await expect(service.recordPollVote(user, 'abc123', 1)).resolves.toEqual({
      status: 'voted',
      optionLabel: 'Статистика',
    });
    await expect(service.recordPollVote(user, 'abc123', 1)).resolves.toEqual({
      status: 'already_voted',
      optionLabel: 'Статистика',
    });

    expect(repository.createPollVote).toHaveBeenCalledTimes(1);

    await expect(service.recordPollVote({ ...user, consentGiven: false }, 'abc123', 1)).resolves.toEqual({
      status: 'not_allowed',
    });
    expect(telegramCopy.announcements.voteSaved).toBe('Голос сохранен.');
  });

  it('rejects poll votes before the announcement is sent or actively sending', async () => {
    const { service, repository } = createService();
    const user = buildUser({
      id: 'user-1',
      telegramId: 8901n,
      consentGiven: true,
      onboardingCompleted: false,
    });

    repository.findCampaignByPollToken.mockResolvedValue(baseCampaign);

    await expect(service.recordPollVote(user, 'abc123', 1)).resolves.toEqual({
      status: 'not_found',
    });

    expect(repository.findExistingVote).not.toHaveBeenCalled();
    expect(repository.createPollVote).not.toHaveBeenCalled();
  });
});
