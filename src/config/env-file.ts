import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvTarget = Record<string, string | undefined>;

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function loadLocalEnvFile(
  envPath = resolve(process.cwd(), '.env'),
  target: EnvTarget = process.env,
): void {
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const parsed = parseEnvLine(rawLine);

    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;

    if (target[key] !== undefined) {
      continue;
    }

    target[key] = value;
  }
}

function parseEnvLine(rawLine: string): [string, string] | null {
  let line = rawLine.trim();

  if (!line || line.startsWith('#')) {
    return null;
  }

  if (line.startsWith('export ')) {
    line = line.slice('export '.length).trim();
  }

  const separatorIndex = line.indexOf('=');

  if (separatorIndex <= 0) {
    return null;
  }

  const key = line.slice(0, separatorIndex).trim();

  if (!ENV_KEY_PATTERN.test(key)) {
    return null;
  }

  return [key, normalizeEnvValue(line.slice(separatorIndex + 1).trim())];
}

function normalizeEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
