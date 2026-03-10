import { Injectable } from '@nestjs/common';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

import type { ChartPoint } from './charts.types';

@Injectable()
export class ChartsRenderer {
  private readonly chartCanvas = new ChartJSNodeCanvas({
    width: 1000,
    height: 560,
    backgroundColour: 'white',
  });

  async renderCombinedChart(points: ChartPoint[]): Promise<Buffer> {
    const labels = points.map((point) => point.date);

    return this.chartCanvas.renderToBuffer({
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Настроение',
            data: points.map((point) => point.mood ?? null),
            borderColor: '#2563eb',
            backgroundColor: '#2563eb',
          },
          {
            label: 'Энергия',
            data: points.map((point) => point.energy ?? null),
            borderColor: '#16a34a',
            backgroundColor: '#16a34a',
          },
          {
            label: 'Стресс',
            data: points.map((point) => point.stress ?? null),
            borderColor: '#dc2626',
            backgroundColor: '#dc2626',
          },
        ],
      },
      options: {
        responsive: false,
        scales: {
          y: {
            min: 0,
            max: 10,
          },
        },
      },
    });
  }

  async renderSleepChart(points: ChartPoint[]): Promise<Buffer> {
    const labels = points.map((point) => point.date);

    return this.chartCanvas.renderToBuffer({
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Сон (часы)',
            data: points.map((point) => point.sleepHours ?? null),
            borderColor: '#7c3aed',
            backgroundColor: '#7c3aed',
          },
        ],
      },
      options: {
        responsive: false,
        scales: {
          y: {
            min: 0,
            max: 24,
          },
        },
      },
    });
  }
}
