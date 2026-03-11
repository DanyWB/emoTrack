import { Injectable } from '@nestjs/common';

import type { ChartPoint, GeneratedCharts } from './charts.types';
import { ChartsRenderer } from './charts.renderer';

@Injectable()
export class ChartsService {
  constructor(private readonly chartsRenderer: ChartsRenderer) {}

  async generatePeriodCharts(points: ChartPoint[]): Promise<GeneratedCharts> {
    if (points.length === 0) {
      return {};
    }

    const combinedChartBuffer = await this.renderCombinedChart(points);
    const hasSleepData = points.some(
      (point) => typeof point.sleepHours === 'number' || typeof point.sleepQuality === 'number',
    );

    if (!hasSleepData) {
      return { combinedChartBuffer };
    }

    const sleepChartBuffer = await this.renderSleepChart(points);
    return {
      combinedChartBuffer,
      sleepChartBuffer,
    };
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
