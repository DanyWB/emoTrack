import { Module } from '@nestjs/common';

import { DailyMetricsModule } from '../daily-metrics/daily-metrics.module';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [DailyMetricsModule],
  providers: [UsersRepository, UsersService],
  exports: [UsersRepository, UsersService],
})
export class UsersModule {}
