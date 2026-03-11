import { Module } from '@nestjs/common';
import { StatsModule } from '../stats/stats.module';

import { SummariesFormatter } from './summaries.formatter';
import { SummariesRepository } from './summaries.repository';
import { SummariesService } from './summaries.service';

@Module({
  imports: [StatsModule],
  providers: [SummariesRepository, SummariesFormatter, SummariesService],
  exports: [SummariesRepository, SummariesFormatter, SummariesService],
})
export class SummariesModule {}
