import { Injectable } from '@nestjs/common';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartData, LegendItem } from 'chart.js';

import type { ChartPoint } from './charts.types';
import {
  formatChartLabels,
  resolveChartLineTension,
  resolveChartPointRadius,
  resolveMaxTicksLimit,
  resolveMoodHeatStripColor,
  shouldOffsetXAxis,
} from './charts.utils';

const CHART_WIDTH = 960;
const CHART_HEIGHT = 720;
const HEAT_STRIP_HEIGHT = 220;

@Injectable()
export class ChartsRenderer {
  private readonly chartCanvas = new ChartJSNodeCanvas({
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    backgroundColour: 'white',
  });
  private readonly heatStripCanvas = new ChartJSNodeCanvas({
    width: CHART_WIDTH,
    height: HEAT_STRIP_HEIGHT,
    backgroundColour: 'white',
  });

  async renderCombinedChart(points: ChartPoint[]): Promise<Buffer> {
    const labels = formatChartLabels(points.map((point) => point.date));
    const pointRadius = resolveChartPointRadius(points.length);
    const tension = resolveChartLineTension(points.length);

    return this.chartCanvas.renderToBuffer({
      type: 'line',
      data: {
        labels,
        datasets: [
          this.buildMoodDataset(points, pointRadius, tension),
          this.buildMetricDataset('Энергия', points.map((point) => point.energy ?? null), '#16a34a', pointRadius, tension),
          this.buildMetricDataset('Стресс', points.map((point) => point.stress ?? null), '#dc2626', pointRadius, tension),
          this.buildEventPresenceDataset(points),
        ],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 20,
            right: 24,
            bottom: 12,
            left: 16,
          },
        },
        plugins: {
          legend: this.buildLegendOptions(),
        },
        scales: {
          x: this.buildXAxisOptions(points.length),
          y: {
            min: 0,
            max: 10,
            grid: {
              color: '#e2e8f0',
            },
            ticks: {
              stepSize: 1,
              color: '#475569',
              font: {
                size: 13,
              },
            },
          },
          eventOverlay: this.buildStatusOverlayAxis(),
        },
      },
    });
  }

  async renderSleepChart(points: ChartPoint[]): Promise<Buffer> {
    const labels = formatChartLabels(points.map((point) => point.date));
    const pointRadius = resolveChartPointRadius(points.length);
    const tension = resolveChartLineTension(points.length);

    return this.chartCanvas.renderToBuffer({
      type: 'line',
      data: {
        labels,
        datasets: [
          this.buildMetricDataset(
            'Сон (часы)',
            points.map((point) => point.sleepHours ?? null),
            '#7c3aed',
            pointRadius,
            tension,
            'hours',
          ),
          this.buildMetricDataset(
            'Сон (качество)',
            points.map((point) => point.sleepQuality ?? null),
            '#0ea5e9',
            pointRadius,
            tension,
            'quality',
          ),
          this.buildSleepMissingDataset(points),
        ],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 20,
            right: 24,
            bottom: 12,
            left: 16,
          },
        },
        plugins: {
          legend: this.buildLegendOptions(),
        },
        scales: {
          x: this.buildXAxisOptions(points.length),
          hours: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 24,
            grid: {
              color: '#e2e8f0',
            },
            ticks: {
              stepSize: 2,
              color: '#475569',
              font: {
                size: 13,
              },
            },
          },
          quality: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 10,
            grid: {
              drawOnChartArea: false,
            },
            ticks: {
              stepSize: 1,
              color: '#475569',
              font: {
                size: 13,
              },
            },
          },
          statusOverlay: this.buildStatusOverlayAxis(),
        },
      },
    });
  }

  async renderMoodHeatStrip(points: ChartPoint[]): Promise<Buffer> {
    const labels = formatChartLabels(points.map((point) => point.date));

    return this.heatStripCanvas.renderToBuffer({
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Настроение',
            data: points.map(() => 1),
            backgroundColor: points.map((point) => resolveMoodHeatStripColor(point.mood)),
            borderColor: '#ffffff',
            borderWidth: 2,
            borderSkipped: false,
            barPercentage: 0.92,
            categoryPercentage: 1,
          },
        ],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 18,
            right: 24,
            bottom: 12,
            left: 16,
          },
        },
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          x: this.buildXAxisOptions(points.length),
          y: {
            display: false,
            min: 0,
            max: 1,
            grid: {
              display: false,
            },
            ticks: {
              display: false,
            },
          },
        },
      },
    });
  }

  private buildMoodDataset(points: ChartPoint[], pointRadius: number, tension: number) {
    return {
      ...this.buildMetricDataset(
        'Настроение',
        points.map((point) => point.mood ?? null),
        '#2563eb',
        pointRadius,
        tension,
      ),
      pointRadius: points.map((point) => (point.isBestDay || point.isWorstDay ? pointRadius + 2 : pointRadius)),
      pointHoverRadius: points.map((point) =>
        point.isBestDay || point.isWorstDay ? pointRadius + 3 : pointRadius + 1,
      ),
      pointStyle: points.map((point) => {
        if (point.isBestDay) {
          return 'triangle';
        }

        if (point.isWorstDay) {
          return 'rectRot';
        }

        return 'circle';
      }),
      pointBackgroundColor: points.map((point) => {
        if (point.isBestDay) {
          return '#dcfce7';
        }

        if (point.isWorstDay) {
          return '#fee2e2';
        }

        return '#ffffff';
      }),
      pointBorderColor: points.map((point) => {
        if (point.isBestDay) {
          return '#15803d';
        }

        if (point.isWorstDay) {
          return '#b91c1c';
        }

        return '#2563eb';
      }),
      pointBorderWidth: points.map((point) => (point.isBestDay || point.isWorstDay ? 3 : 2)),
    };
  }

  private buildEventPresenceDataset(points: ChartPoint[]) {
    return {
      type: 'line' as const,
      label: 'Есть события',
      data: points.map((point) => (point.hasEvent ? 0.92 : null)),
      yAxisID: 'eventOverlay',
      showLine: false,
      pointStyle: 'rectRot',
      pointRadius: 4,
      pointHoverRadius: 5,
      pointBorderWidth: 1.5,
      pointBorderColor: '#ffffff',
      pointBackgroundColor: '#334155',
      skipLegend: true,
    };
  }

  private buildSleepMissingDataset(points: ChartPoint[]) {
    return {
      type: 'line' as const,
      label: 'Нет данных о сне',
      data: points.map((point) => (point.isSleepMissing ? 0.9 : null)),
      yAxisID: 'statusOverlay',
      showLine: false,
      pointStyle: 'crossRot',
      pointRadius: 4,
      pointHoverRadius: 5,
      pointBorderWidth: 1.5,
      pointBorderColor: '#64748b',
      pointBackgroundColor: '#ffffff',
      skipLegend: true,
    };
  }

  private buildMetricDataset(
    label: string,
    data: Array<number | null>,
    color: string,
    pointRadius: number,
    tension: number,
    yAxisID?: string,
  ) {
    return {
      label,
      data,
      borderColor: color,
      backgroundColor: color,
      pointBorderColor: color,
      pointBackgroundColor: '#ffffff',
      pointRadius,
      pointHoverRadius: pointRadius + 1,
      pointBorderWidth: 2,
      borderWidth: 3,
      tension,
      spanGaps: true,
      fill: false,
      ...(yAxisID ? { yAxisID } : {}),
    };
  }

  private buildLegendOptions() {
    return {
      display: true,
      position: 'top' as const,
      labels: {
        usePointStyle: true,
        boxWidth: 12,
        padding: 16,
        color: '#0f172a',
        font: {
          size: 14,
        },
        filter: (legendItem: LegendItem, data: ChartData) =>
          !((data.datasets[legendItem.datasetIndex ?? -1] as { skipLegend?: boolean } | undefined)?.skipLegend),
      },
    };
  }

  private buildXAxisOptions(pointsCount: number) {
    return {
      offset: shouldOffsetXAxis(pointsCount),
      grid: {
        display: false,
      },
      ticks: {
        autoSkip: true,
        maxTicksLimit: resolveMaxTicksLimit(pointsCount),
        maxRotation: 0,
        minRotation: 0,
        padding: 10,
        color: '#475569',
        font: {
          size: 13,
        },
      },
    };
  }

  private buildStatusOverlayAxis() {
    return {
      type: 'linear' as const,
      display: false,
      min: 0,
      max: 1,
      grid: {
        display: false,
      },
      ticks: {
        display: false,
      },
    };
  }
}
