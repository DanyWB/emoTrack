import { ChartsService } from '../../src/charts/charts.service';

describe('ChartsService', () => {
  it('returns only the combined chart when sleep data is absent', async () => {
    const chartsRenderer = {
      renderCombinedChart: jest.fn().mockResolvedValue(Buffer.from('combined')),
      renderSleepChart: jest.fn().mockResolvedValue(Buffer.from('sleep')),
      renderMoodHeatStrip: jest.fn().mockResolvedValue(Buffer.from('mood-strip')),
    };
    const service = new ChartsService(chartsRenderer as never);

    const result = await service.generatePeriodCharts([
      { date: '2026-03-09', mood: 5, energy: 6, stress: 4 },
      { date: '2026-03-10', mood: 6, energy: 5, stress: 4 },
      { date: '2026-03-11', mood: 7, energy: 7, stress: 3 },
    ]);

    expect(result.combinedChartBuffer).toEqual(Buffer.from('combined'));
    expect(result.moodHeatStripBuffer).toEqual(Buffer.from('mood-strip'));
    expect(result.sleepChartBuffer).toBeUndefined();
    expect(chartsRenderer.renderCombinedChart).toHaveBeenCalledTimes(1);
    expect(chartsRenderer.renderSleepChart).not.toHaveBeenCalled();
    expect(chartsRenderer.renderMoodHeatStrip).toHaveBeenCalledTimes(1);
  });

  it('returns combined and sleep charts when sleep data is present', async () => {
    const chartsRenderer = {
      renderCombinedChart: jest.fn().mockResolvedValue(Buffer.from('combined')),
      renderSleepChart: jest.fn().mockResolvedValue(Buffer.from('sleep')),
      renderMoodHeatStrip: jest.fn().mockResolvedValue(Buffer.from('mood-strip')),
    };
    const service = new ChartsService(chartsRenderer as never);

    const result = await service.generatePeriodCharts([
      { date: '2026-03-09', mood: 5, energy: 6, stress: 4, sleepHours: 7 },
      { date: '2026-03-10', mood: 6, energy: 5, stress: 4, sleepQuality: 6 },
      { date: '2026-03-11', mood: 7, energy: 7, stress: 3, sleepHours: 7.5, sleepQuality: 8 },
    ]);

    expect(result.combinedChartBuffer).toEqual(Buffer.from('combined'));
    expect(result.sleepChartBuffer).toEqual(Buffer.from('sleep'));
    expect(result.moodHeatStripBuffer).toEqual(Buffer.from('mood-strip'));
    expect(chartsRenderer.renderCombinedChart).toHaveBeenCalledTimes(1);
    expect(chartsRenderer.renderSleepChart).toHaveBeenCalledTimes(1);
    expect(chartsRenderer.renderMoodHeatStrip).toHaveBeenCalledTimes(1);
  });

  it('skips the compact mood strip when the dataset would be too dense', async () => {
    const chartsRenderer = {
      renderCombinedChart: jest.fn().mockResolvedValue(Buffer.from('combined')),
      renderSleepChart: jest.fn().mockResolvedValue(Buffer.from('sleep')),
      renderMoodHeatStrip: jest.fn().mockResolvedValue(Buffer.from('mood-strip')),
    };
    const service = new ChartsService(chartsRenderer as never);

    const result = await service.generatePeriodCharts(
      Array.from({ length: 31 }, (_, index) => ({
        date: `2026-03-${String(index + 1).padStart(2, '0')}`,
        mood: 6,
        energy: 6,
        stress: 4,
      })),
    );

    expect(result.combinedChartBuffer).toEqual(Buffer.from('combined'));
    expect(result.moodHeatStripBuffer).toBeUndefined();
    expect(chartsRenderer.renderCombinedChart).toHaveBeenCalledTimes(1);
    expect(chartsRenderer.renderMoodHeatStrip).not.toHaveBeenCalled();
  });
});
