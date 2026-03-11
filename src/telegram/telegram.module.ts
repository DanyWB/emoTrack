import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, type Context } from 'telegraf';

import { AnalyticsModule } from '../analytics/analytics.module';
import { ChartsModule } from '../charts/charts.module';
import { CheckinsModule } from '../checkins/checkins.module';
import type { TelegramConfig } from '../config/telegram.config';
import { EventsModule } from '../events/events.module';
import { FsmModule } from '../fsm/fsm.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { RemindersModule } from '../reminders/reminders.module';
import { SummariesModule } from '../summaries/summaries.module';
import { TagsModule } from '../tags/tags.module';
import { UsersModule } from '../users/users.module';
import { TelegramRouter } from './telegram.router';
import { TelegramUpdate } from './telegram.update';

export const TELEGRAM_BOT = 'TELEGRAM_BOT';

@Module({
  imports: [
    UsersModule,
    OnboardingModule,
    FsmModule,
    CheckinsModule,
    EventsModule,
    TagsModule,
    AnalyticsModule,
    SummariesModule,
    ChartsModule,
    RemindersModule,
  ],
  providers: [
    {
      provide: TELEGRAM_BOT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Telegraf<Context> => {
        const telegram = configService.get<TelegramConfig>('telegram', { infer: true });

        if (!telegram?.botToken) {
          throw new Error('TELEGRAM_BOT_TOKEN is required');
        }

        return new Telegraf<Context>(telegram.botToken);
      },
    },
    TelegramRouter,
    TelegramUpdate,
  ],
  exports: [TELEGRAM_BOT, TelegramRouter],
})
export class TelegramModule {}
