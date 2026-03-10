import { registerAs } from '@nestjs/config';
import { parseBooleanEnv } from './config.utils';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  defaultTimezone: string;
  chartTempDir: string;
  redisEnabled: boolean;
  jobsEnabled: boolean;
}

export default registerAs(
  'app',
  (): AppConfig => ({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    defaultTimezone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Berlin',
    chartTempDir: process.env.CHART_TEMP_DIR ?? './tmp/charts',
    redisEnabled: parseBooleanEnv(process.env.REDIS_ENABLED, false),
    jobsEnabled: parseBooleanEnv(process.env.JOBS_ENABLED, false),
  }),
);
