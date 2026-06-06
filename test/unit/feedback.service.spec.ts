import type { FeedbackItem } from '@prisma/client';

import { FeedbackService } from '../../src/feedback/feedback.service';
import { buildUser, createConfigService } from '../helpers/in-memory';

describe('FeedbackService', () => {
  function createService() {
    const item: FeedbackItem = {
      id: 'feedback-1',
      userId: 'user-1',
      feedbackType: 'bug',
      message: 'Кнопка не сработала',
      status: 'unread',
      createdAt: new Date('2026-06-05T10:00:00.000Z'),
      updatedAt: new Date('2026-06-05T10:00:00.000Z'),
    };
    const repository = {
      create: jest.fn().mockResolvedValue(item),
    };
    const analyticsService = {
      track: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FeedbackService(
      repository as never,
      analyticsService as never,
      createConfigService({
        admin: { telegramIds: [123n] },
        telegram: { botToken: 'replace_with_real_token' },
      }),
    );

    return { service, repository, analyticsService, item };
  }

  it('saves valid feedback and tracks the event', async () => {
    const { service, repository, analyticsService, item } = createService();
    const user = buildUser({ id: 'user-1', telegramId: 8901n });

    await expect(service.submit(user, 'bug', '  Кнопка не сработала  ')).resolves.toBe(item);

    expect(repository.create).toHaveBeenCalledWith({
      userId: user.id,
      feedbackType: 'bug',
      message: 'Кнопка не сработала',
    });
    expect(analyticsService.track).toHaveBeenCalledWith(
      'feedback_submitted',
      { type: 'bug', feedbackId: item.id },
      user.id,
    );
  });

  it('rejects empty or too-long feedback without writing', async () => {
    const { service, repository, analyticsService } = createService();
    const user = buildUser({ id: 'user-1', telegramId: 8901n });

    await expect(service.submit(user, 'idea', '   ')).resolves.toBeNull();
    await expect(service.submit(user, 'idea', 'x'.repeat(1001))).resolves.toBeNull();

    expect(repository.create).not.toHaveBeenCalled();
    expect(analyticsService.track).not.toHaveBeenCalled();
  });
});
