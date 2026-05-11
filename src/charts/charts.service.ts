import { Injectable, Logger } from '@nestjs/common';

import type { ChartPoint, GeneratedCharts, SingleMetricChartPoint } from './charts.types';
import { ChartsRenderer } from './charts.renderer';
import { shouldRenderMoodHeatStrip } from './charts.utils';

@Injectable()
export class ChartsService {
  private readonly logger = new Logger(ChartsService.name);

  constructor(private readonly chartsRenderer: ChartsRenderer) {}

  async generatePeriodCharts(points: ChartPoint[]): Promise<GeneratedCharts> {
    if (points.length === 0) {
      this.logger.debug('Skipped chart generation because there are no chart points.');
      return {};
    }

    const hasCombinedMetricData = points.some(
      (point) =>
        typeof point.mood === 'number' ||
        typeof point.energy === 'number' ||
        typeof point.stress === 'number',
    );
    const hasSleepData = points.some(
      (point) => typeof point.sleepHours === 'number' || typeof point.sleepQuality === 'number',
    );
    const hasMoodData = points.some((point) => typeof point.mood === 'number');
    const shouldAddMoodHeatStrip = hasMoodData && shouldRenderMoodHeatStrip(points.length);
    const combinedChartBuffer = hasCombinedMetricData ? await this.renderCombinedChart(points) : undefined;
    const moodHeatStripBuffer = shouldAddMoodHeatStrip ? await this.renderMoodHeatStrip(points) : undefined;

    if (!hasCombinedMetricData && !hasSleepData) {
      this.logger.debug('Skipped chart generation because there are no supported chart series.');
      return {};
    }

    if (!hasSleepData) {
      this.logger.log(
        `Generated${combinedChartBuffer ? ' combined chart' : ''}${moodHeatStripBuffer ? `${combinedChartBuffer ? ' and' : ''} mood strip` : ''} for ${points.length} points.`,
      );
      return { combinedChartBuffer, moodHeatStripBuffer };
    }

    const sleepChartBuffer = await this.renderSleepChart(points);
    this.logger.log(
      `Generated${combinedChartBuffer ? ' combined' : ''}${moodHeatStripBuffer ? `${combinedChartBuffer ? ',' : ''} mood strip` : ''}${sleepChartBuffer ? `${combinedChartBuffer || moodHeatStripBuffer ? ',' : ''} sleep` : ''} charts for ${points.length} points.`,
    );

    return {
      combinedChartBuffer,
      sleepChartBuffer,
      moodHeatStripBuffer,
    };
  }

  renderCombinedChart(points: Parameters<ChartsRenderer['renderCombinedChart']>[0]) {
    return this.chartsRenderer.renderCombinedChart(points);
  }

  renderSleepChart(points: Parameters<ChartsRenderer['renderSleepChart']>[0]) {
    return this.chartsRenderer.renderSleepChart(points);
  }

  renderMoodHeatStrip(points: Parameters<ChartsRenderer['renderMoodHeatStrip']>[0]) {
    return this.chartsRenderer.renderMoodHeatStrip(points);
  }

  async generateSelectedMetricChart(
    points: SingleMetricChartPoint[],
    options: { label: string; color: string },
  ): Promise<Buffer | undefined> {
    if (points.length === 0 || !points.some((point) => typeof point.value === 'number')) {
      this.logger.debug('Skipped selected-metric chart generation because there are no supported points.');
      return undefined;
    }

    return this.chartsRenderer.renderSelectedMetricChart(points, options);
  }

  cleanupTempFiles(): Promise<void> {
    return Promise.resolve();
  }
}
