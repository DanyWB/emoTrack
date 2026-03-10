import { registerAs } from '@nestjs/config';
import { parseBooleanEnv } from './config.utils';

export interface RedisConfig {
  enabled: boolean;
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  db?: number;
}

function parseRedisConfig(urlRaw: string): Omit<RedisConfig, 'enabled'> {
  const parsed = new URL(urlRaw);
  const dbPart = parsed.pathname.replace('/', '');

  return {
    url: urlRaw,
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: dbPart ? Number(dbPart) : 0,
  };
}

export default registerAs('redis', (): RedisConfig => {
  const enabled = parseBooleanEnv(process.env.REDIS_ENABLED, false);
  const urlRaw = process.env.REDIS_URL;

  if (!enabled || !urlRaw) {
    return {
      enabled: false,
    };
  }

  return {
    enabled: true,
    ...parseRedisConfig(urlRaw),
  };
});
