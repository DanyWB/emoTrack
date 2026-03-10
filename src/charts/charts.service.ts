import { Injectable } from '@nestjs/common';
import { SummaryPeriodType } from '@prisma/client';

import type { GeneratedCharts } from './charts.types';
import { ChartsRenderer } from './charts.renderer';

@Injectable()
export class ChartsService {
  constructor(private readonly chartsRenderer: ChartsRenderer) {}

  generatePeriodCharts(_userId: string, _periodType: SummaryPeriodType): Promise<GeneratedCharts> {
    return Promise.resolve({});
  }

  renderCombinedChart(points: Parameters<ChartsRenderer['renderCombinedChart']>[0]) {
    return this.chartsRenderer.renderCombinedChart(points);
  }

  renderSleepChart(points: Parameters<ChartsRenderer['renderSleepChart']>[0]) {
    return this.chartsRenderer.renderSleepChart(points);
  }

  cleanupTempFiles(): Promise<void> {
    return Promise.resolve();
  }
}
