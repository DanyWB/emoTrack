import {
  formatChartLabels,
  resolveChartLineTension,
  resolveChartPointRadius,
  resolveMaxTicksLimit,
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
});
