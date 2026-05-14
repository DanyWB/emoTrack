import { AdminService } from '../../src/admin/admin.service';
import { parseAdminTelegramIds } from '../../src/config/admin.config';
import { createConfigService } from '../helpers/in-memory';

describe('admin access configuration', () => {
  it('parses comma-separated Telegram ids and ignores invalid tokens', () => {
    expect(parseAdminTelegramIds('123, 456, nope, , 789')).toEqual([123n, 456n, 789n]);
  });

  it('allows only configured Telegram ids', () => {
    const repository = {
      getOverview: jest.fn(),
      listActiveUsers: jest.fn(),
      getUserDetail: jest.fn(),
      findEntryOwnerUserId: jest.fn(),
    };
    const service = new AdminService(
      repository as never,
      createConfigService({ admin: { telegramIds: [123n, 456n] } }),
    );

    expect(service.isAdminTelegramId(123)).toBe(true);
    expect(service.isAdminTelegramId('456')).toBe(true);
    expect(service.isAdminTelegramId(789)).toBe(false);
    expect(service.isAdminTelegramId(undefined)).toBe(false);
  });
});
