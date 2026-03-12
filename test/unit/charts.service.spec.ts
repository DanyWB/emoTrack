import { ChartsService } from '../../src/charts/charts.service';

describe('ChartsService', () => {
  it('returns only the combined chart when sleep data is absent', async () => {
    const chartsRenderer = {
      renderCombinedChart: jest.fn().mockResolvedValue(Buffer.from('combined')),
      renderSleepChart: jest.fn().mockResolvedValue(Buffer.from('sleep')),
    };
    const service = new ChartsService(chartsRenderer as never);

    const result = await service.generatePeriodCharts([
      { date: '2026-03-09', mood: 5, energy: 6, stress: 4 },
      { date: '2026-03-10', mood: 6, energy: 5, stress: 4 },
      { date: '2026-03-11', mood: 7, energy: 7, stress: 3 },
    ]);

    expect(result.combinedChartBuffer).toEqual(Buffer.from('combined'));
    expect(result.sleepChartBuffer).toBeUndefined();
    expect(chartsRenderer.renderCombinedChart).toHaveBeenCalledTimes(1);
    expect(chartsRenderer.renderSleepChart).not.toHaveBeenCalled();
  });

  it('returns combined and sleep charts when sleep data is present', async () => {
    const chartsRenderer = {
      renderCombinedChart: jest.fn().mockResolvedValue(Buffer.from('combined')),
      renderSleepChart: jest.fn().mockResolvedValue(Buffer.from('sleep')),
    };
    const service = new ChartsService(chartsRenderer as never);

    const result = await service.generatePeriodCharts([
      { date: '2026-03-09', mood: 5, energy: 6, stress: 4, sleepHours: 7 },
      { date: '2026-03-10', mood: 6, energy: 5, stress: 4, sleepQuality: 6 },
      { date: '2026-03-11', mood: 7, energy: 7, stress: 3, sleepHours: 7.5, sleepQuality: 8 },
    ]);

    expect(result.combinedChartBuffer).toEqual(Buffer.from('combined'));
    expect(result.sleepChartBuffer).toEqual(Buffer.from('sleep'));
    expect(chartsRenderer.renderCombinedChart).toHaveBeenCalledTimes(1);
    expect(chartsRenderer.renderSleepChart).toHaveBeenCalledTimes(1);
  });
});
