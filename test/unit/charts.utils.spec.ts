import {
  formatChartLabels,
  resolveChartLineTension,
  resolveChartPointRadius,
  resolveMaxTicksLimit,
  resolveMoodHeatStripColor,
  shouldRenderMoodHeatStrip,
  shouldOffsetXAxis,
} from '../../src/charts/charts.utils';

describe('charts utils', () => {
  it('formats labels compactly within one year and includes year across years', () => {
    expect(formatChartLabels(['2026-03-10', '2026-03-11'])).toEqual(['10.03', '11.03']);
    expect(formatChartLabels(['2025-12-31', '2026-01-01'])).toEqual(['31.12.25', '01.01.26']);
  });

  it('uses larger points and lower tension for very small datasets', () => {
    expect(resolveChartPointRadius(3)).toBe(4);
    expect(resolveChartPointRadius(8)).toBe(3);
    expect(resolveChartPointRadius(30)).toBe(2);

    expect(resolveChartLineTension(3)).toBe(0.15);
    expect(resolveChartLineTension(8)).toBe(0.25);
  });

  it('caps x-axis tick density for mobile readability', () => {
    expect(resolveMaxTicksLimit(3)).toBe(3);
    expect(resolveMaxTicksLimit(8)).toBe(5);
    expect(resolveMaxTicksLimit(18)).toBe(6);
    expect(resolveMaxTicksLimit(50)).toBe(8);

    expect(shouldOffsetXAxis(4)).toBe(true);
    expect(shouldOffsetXAxis(12)).toBe(false);
  });

  it('renders the compact mood strip only when it stays Telegram-readable', () => {
    expect(shouldRenderMoodHeatStrip(2)).toBe(false);
    expect(shouldRenderMoodHeatStrip(3)).toBe(true);
    expect(shouldRenderMoodHeatStrip(18)).toBe(true);
    expect(shouldRenderMoodHeatStrip(31)).toBe(false);
  });

  it('maps mood values to stable compact heat-strip colors', () => {
    expect(resolveMoodHeatStripColor(undefined)).toBe('#e2e8f0');
    expect(resolveMoodHeatStripColor(2)).toBe('#ef4444');
    expect(resolveMoodHeatStripColor(4)).toBe('#f97316');
    expect(resolveMoodHeatStripColor(6)).toBe('#f59e0b');
    expect(resolveMoodHeatStripColor(8)).toBe('#84cc16');
    expect(resolveMoodHeatStripColor(10)).toBe('#16a34a');
  });
});
