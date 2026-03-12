import { Injectable } from '@nestjs/common';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

import type { ChartPoint } from './charts.types';
import {
  formatChartLabels,
  resolveChartLineTension,
  resolveChartPointRadius,
  resolveMaxTicksLimit,
  shouldOffsetXAxis,
} from './charts.utils';

const CHART_WIDTH = 960;
const CHART_HEIGHT = 720;

@Injectable()
export class ChartsRenderer {
  private readonly chartCanvas = new ChartJSNodeCanvas({
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
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
          this.buildMetricDataset('Настроение', points.map((point) => point.mood ?? null), '#2563eb', pointRadius, tension),
          this.buildMetricDataset('Энергия', points.map((point) => point.energy ?? null), '#16a34a', pointRadius, tension),
          this.buildMetricDataset('Стресс', points.map((point) => point.stress ?? null), '#dc2626', pointRadius, tension),
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
        },
      },
    });
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
}
