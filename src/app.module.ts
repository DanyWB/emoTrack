import './config/bootstrap-env';

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

import appConfig from './config/app.config';
import { parseBooleanEnv } from './config/config.utils';
import databaseConfig from './config/database.config';
import redisConfig, { type RedisConfig } from './config/redis.config';
import telegramConfig from './config/telegram.config';
import { validateEnv } from './config/validation';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './database/redis.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { FsmModule } from './fsm/fsm.module';
import { CheckinsModule } from './checkins/checkins.module';
import { EventsModule } from './events/events.module';
import { TagsModule } from './tags/tags.module';
import { StatsModule } from './stats/stats.module';
import { SummariesModule } from './summaries/summaries.module';
import { ChartsModule } from './charts/charts.module';
import { RemindersModule } from './reminders/reminders.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthModule } from './health/health.module';

const jobsEnabled = parseBooleanEnv(process.env.JOBS_ENABLED, false);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig, redisConfig, telegramConfig],
      validate: validateEnv,
    }),
    ...(jobsEnabled
      ? [
          BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
              const redis = configService.get<RedisConfig>('redis', { infer: true });

              if (!redis?.enabled || !redis.host || !redis.port) {
                throw new Error('BullMQ requires an enabled Redis connection.');
              }

              return {
                connection: {
                  host: redis.host,
                  port: redis.port,
                  username: redis.username,
                  password: redis.password,
                  db: redis.db,
                },
              };
            },
          }),
        ]
      : []),
    PrismaModule,
    RedisModule,
    TelegramModule,
    UsersModule,
    OnboardingModule,
    FsmModule,
    CheckinsModule,
    EventsModule,
    TagsModule,
    StatsModule,
    SummariesModule,
    ChartsModule,
    RemindersModule,
    AnalyticsModule,
    HealthModule,
  ],
})
export class AppModule {}
