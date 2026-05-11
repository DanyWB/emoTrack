import { Logger } from '@nestjs/common';

import { TelegramUpdate } from '../../src/telegram/telegram.update';
import { TELEGRAM_COMMANDS } from '../../src/telegram/telegram.copy';

describe('TelegramUpdate', () => {
  function createRuntimeStatus() {
    return {
      markStarting: jest.fn(),
      markReady: jest.fn(),
      markSkipped: jest.fn(),
      markFailed: jest.fn(),
    };
  }

  function createConfigService(overrides: Record<string, unknown> = {}) {
    return {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'telegram.botToken': 'test-bot-token',
          'telegram.mode': 'polling',
          telegram: {
            startupTimeoutMs: 10000,
          },
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
      launch: jest.fn((onLaunch?: () => void) => {
        onLaunch?.();
        return new Promise(() => undefined);
      }),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const router = {
      register: jest.fn(),
    };
    const runtimeStatus = createRuntimeStatus();
    const update = new TelegramUpdate(bot as never, router as never, createConfigService() as never, runtimeStatus as never);

    await update.onModuleInit();

    expect(router.register).toHaveBeenCalledWith(bot);
    expect(bot.telegram.setMyCommands).toHaveBeenCalledWith([...TELEGRAM_COMMANDS]);
    expect(bot.launch).toHaveBeenCalledWith(expect.any(Function));
    expect(runtimeStatus.markStarting).toHaveBeenCalledWith('polling', true);
    expect(runtimeStatus.markReady).toHaveBeenCalledWith('polling');
  });

  it('registers webhook mode without launching polling', async () => {
    const bot = {
      telegram: {
        setMyCommands: jest.fn().mockResolvedValue(undefined),
        setWebhook: jest.fn().mockResolvedValue(undefined),
      },
      launch: jest.fn((onLaunch?: () => void) => {
        onLaunch?.();
        return new Promise(() => undefined);
      }),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const router = {
      register: jest.fn(),
    };
    const runtimeStatus = createRuntimeStatus();
    const update = new TelegramUpdate(
      bot as never,
      router as never,
      createConfigService({
        'telegram.mode': 'webhook',
        'telegram.webhookUrl': 'https://example.com/telegram/webhook',
        'telegram.webhookSecret': 'secret-token',
      }) as never,
      runtimeStatus as never,
    );

    await update.onModuleInit();

    expect(router.register).toHaveBeenCalledWith(bot);
    expect(bot.telegram.setMyCommands).toHaveBeenCalledWith([...TELEGRAM_COMMANDS]);
    expect(bot.telegram.setWebhook).toHaveBeenCalledWith('https://example.com/telegram/webhook', {
      secret_token: 'secret-token',
    });
    expect(bot.launch).not.toHaveBeenCalled();
    expect(runtimeStatus.markStarting).toHaveBeenCalledWith('webhook', true);
    expect(runtimeStatus.markReady).toHaveBeenCalledWith('webhook');
  });

  it('keeps startup alive when Telegram command sync fails', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const bot = {
      telegram: {
        setMyCommands: jest.fn().mockRejectedValue(new Error('set commands failed')),
      },
      launch: jest.fn((onLaunch?: () => void) => {
        onLaunch?.();
        return new Promise(() => undefined);
      }),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const router = {
      register: jest.fn(),
    };
    const runtimeStatus = createRuntimeStatus();
    const update = new TelegramUpdate(bot as never, router as never, createConfigService() as never, runtimeStatus as never);

    try {
      await update.onModuleInit();

      expect(bot.telegram.setMyCommands).toHaveBeenCalledWith([...TELEGRAM_COMMANDS]);
      expect(bot.launch).toHaveBeenCalledWith(expect.any(Function));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('event=telegram_commands_sync_failed'));
      expect(runtimeStatus.markReady).toHaveBeenCalledWith('polling');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('keeps startup alive when Telegram command sync times out', async () => {
    jest.useFakeTimers();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const bot = {
      telegram: {
        setMyCommands: jest.fn().mockReturnValue(new Promise(() => undefined)),
      },
      launch: jest.fn((onLaunch?: () => void) => {
        onLaunch?.();
        return new Promise(() => undefined);
      }),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const router = {
      register: jest.fn(),
    };
    const runtimeStatus = createRuntimeStatus();
    const update = new TelegramUpdate(
      bot as never,
      router as never,
      createConfigService({
        telegram: {
          startupTimeoutMs: 1000,
        },
      }) as never,
      runtimeStatus as never,
    );

    try {
      const initPromise = update.onModuleInit();

      await jest.advanceTimersByTimeAsync(1000);
      await initPromise;

      expect(bot.telegram.setMyCommands).toHaveBeenCalledWith([...TELEGRAM_COMMANDS]);
      expect(bot.launch).toHaveBeenCalledWith(expect.any(Function));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('event=telegram_commands_sync_failed'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('setMyCommands'));
      expect(runtimeStatus.markReady).toHaveBeenCalledWith('polling');
    } finally {
      warnSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('marks Telegram runtime failed when bot launch fails', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const bot = {
      telegram: {
        setMyCommands: jest.fn().mockResolvedValue(undefined),
      },
      launch: jest.fn().mockRejectedValue(new Error('launch failed')),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const router = {
      register: jest.fn(),
    };
    const runtimeStatus = createRuntimeStatus();
    const update = new TelegramUpdate(bot as never, router as never, createConfigService() as never, runtimeStatus as never);

    try {
      await update.onModuleInit();
      await Promise.resolve();

      expect(bot.launch).toHaveBeenCalledWith(expect.any(Function));
      expect(runtimeStatus.markFailed).toHaveBeenCalledWith('polling', expect.any(Error));
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('event=telegram_launch_failed'),
        expect.any(String),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('marks Telegram runtime failed when bot launch times out', async () => {
    jest.useFakeTimers();
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const bot = {
      telegram: {
        setMyCommands: jest.fn().mockResolvedValue(undefined),
      },
      launch: jest.fn().mockReturnValue(new Promise(() => undefined)),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const router = {
      register: jest.fn(),
    };
    const runtimeStatus = createRuntimeStatus();
    const update = new TelegramUpdate(
      bot as never,
      router as never,
      createConfigService({
        telegram: {
          startupTimeoutMs: 1000,
        },
      }) as never,
      runtimeStatus as never,
    );

    try {
      const initPromise = update.onModuleInit();

      await initPromise;
      await jest.advanceTimersByTimeAsync(1000);

      expect(bot.launch).toHaveBeenCalledWith(expect.any(Function));
      expect(runtimeStatus.markFailed).toHaveBeenCalledWith(
        'polling',
        expect.any(Error),
        'polling_launch_timeout',
      );
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('event=telegram_launch_failed'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('launch after 1000ms'));
    } finally {
      errorSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('marks Telegram runtime skipped when the token is a local placeholder', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
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
    const runtimeStatus = createRuntimeStatus();
    const update = new TelegramUpdate(
      bot as never,
      router as never,
      createConfigService({
        'telegram.botToken': 'replace_with_real_token',
      }) as never,
      runtimeStatus as never,
    );

    try {
      await update.onModuleInit();

      expect(bot.telegram.setMyCommands).not.toHaveBeenCalled();
      expect(bot.launch).not.toHaveBeenCalled();
      expect(runtimeStatus.markStarting).toHaveBeenCalledWith('polling', false);
      expect(runtimeStatus.markSkipped).toHaveBeenCalledWith('polling', 'token_placeholder');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('event=telegram_launch_skipped'));
    } finally {
      warnSpy.mockRestore();
    }
  });
});
