import { Module } from '@nestjs/common';

import { ChartsRenderer } from './charts.renderer';
import { ChartsService } from './charts.service';

@Module({
  providers: [ChartsRenderer, ChartsService],
  exports: [ChartsRenderer, ChartsService],
})
export class ChartsModule {}
