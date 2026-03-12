import { Injectable, Logger } from '@nestjs/common';

import type { ChartPoint, GeneratedCharts } from './charts.types';
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

    const combinedChartBuffer = await this.renderCombinedChart(points);
    const hasSleepData = points.some(
      (point) => typeof point.sleepHours === 'number' || typeof point.sleepQuality === 'number',
    );
    const shouldAddMoodHeatStrip = shouldRenderMoodHeatStrip(points.length);
    const moodHeatStripBuffer = shouldAddMoodHeatStrip ? await this.renderMoodHeatStrip(points) : undefined;

    if (!hasSleepData) {
      this.logger.log(
        `Generated combined chart${moodHeatStripBuffer ? ' and mood strip' : ''} for ${points.length} points.`,
      );
      return { combinedChartBuffer, moodHeatStripBuffer };
    }

    const sleepChartBuffer = await this.renderSleepChart(points);
    this.logger.log(
      `Generated combined${moodHeatStripBuffer ? ', mood strip,' : ''} and sleep charts for ${points.length} points.`,
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

  cleanupTempFiles(): Promise<void> {
    return Promise.resolve();
  }
}
