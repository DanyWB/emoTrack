import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadLocalEnvFile } from '../../src/config/env-file';

describe('loadLocalEnvFile', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('loads local env values without overwriting externally provided variables', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'emotrack-env-'));
    const envPath = join(tempDir, '.env');
    const target: Record<string, string | undefined> = {
      JOBS_ENABLED: 'false',
    };

    writeFileSync(
      envPath,
      [
        '# local test env',
        'JOBS_ENABLED=true',
        'REDIS_ENABLED=true',
        'TELEGRAM_WEBHOOK_URL="https://example.com/telegram/webhook"',
        "TELEGRAM_WEBHOOK_SECRET='secret-token'",
        'export DEFAULT_TIMEZONE=Europe/Moscow',
      ].join('\n'),
    );

    loadLocalEnvFile(envPath, target);

    expect(target).toEqual({
      JOBS_ENABLED: 'false',
      REDIS_ENABLED: 'true',
      TELEGRAM_WEBHOOK_URL: 'https://example.com/telegram/webhook',
      TELEGRAM_WEBHOOK_SECRET: 'secret-token',
      DEFAULT_TIMEZONE: 'Europe/Moscow',
    });
  });

  it('ignores a missing env file', () => {
    const target: Record<string, string | undefined> = {};

    expect(() => loadLocalEnvFile(join(tmpdir(), 'missing-emotrack.env'), target)).not.toThrow();
    expect(target).toEqual({});
  });
});
