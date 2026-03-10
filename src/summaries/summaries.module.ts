import { Module } from '@nestjs/common';

import { SummariesFormatter } from './summaries.formatter';
import { SummariesRepository } from './summaries.repository';
import { SummariesService } from './summaries.service';

@Module({
  providers: [SummariesRepository, SummariesFormatter, SummariesService],
  exports: [SummariesRepository, SummariesFormatter, SummariesService],
})
export class SummariesModule {}
