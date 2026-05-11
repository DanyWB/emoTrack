import { TelegramUpdate } from '../../src/telegram/telegram.update';
import { TELEGRAM_COMMANDS } from '../../src/telegram/telegram.copy';

describe('TelegramUpdate', () => {
  function createConfigService(overrides: Record<string, unknown> = {}) {
    return {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'telegram.botToken': 'test-bot-token',
          'telegram.mode': 'polling',
          'app.nodeEnv': 'development',
          ...overrides,
        };

        return values[key];
      }),
    };
  }

  it('registers router handlers, syncs commands, and launches the bot in polling mode', async () => {
    const bot = {
      telegram: {
        setMyCommands: jest.fn().mockResolvedValue(undefined),
      },
      launch: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const router = {
      register: jest.fn(),
    };
    const update = new TelegramUpdate(bot as never, router as never, createConfigService() as never);

    await update.onModuleInit();

    expect(router.register).toHaveBeenCalledWith(bot);
    expect(bot.telegram.setMyCommands).toHaveBeenCalledWith([...TELEGRAM_COMMANDS]);
    expect(bot.launch).toHaveBeenCalledTimes(1);
  });

  it('keeps startup alive when Telegram command sync fails', async () => {
    const bot = {
      telegram: {
        setMyCommands: jest.fn().mockRejectedValue(new Error('set commands failed')),
      },
      launch: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const router = {
      register: jest.fn(),
    };
    const update = new TelegramUpdate(bot as never, router as never, createConfigService() as never);

    await update.onModuleInit();

    expect(bot.telegram.setMyCommands).toHaveBeenCalledWith([...TELEGRAM_COMMANDS]);
    expect(bot.launch).toHaveBeenCalledTimes(1);
  });
});
