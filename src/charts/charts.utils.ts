export function formatChartLabels(dateKeys: string[]): string[] {
  const includeYear = new Set(dateKeys.map((dateKey) => dateKey.slice(0, 4))).size > 1;

  return dateKeys.map((dateKey) => {
    const [year, month, day] = dateKey.split('-');

    if (!year || !month || !day) {
      return dateKey;
    }

    return includeYear ? `${day}.${month}.${year.slice(2)}` : `${day}.${month}`;
  });
}

export function resolveChartPointRadius(pointsCount: number): number {
  if (pointsCount <= 4) {
    return 4;
  }

  if (pointsCount <= 10) {
    return 3;
  }

  return 2;
}

export function resolveChartLineTension(pointsCount: number): number {
  return pointsCount <= 4 ? 0.15 : 0.25;
}

export function resolveMaxTicksLimit(pointsCount: number): number {
  if (pointsCount <= 4) {
    return pointsCount;
  }

  if (pointsCount <= 10) {
    return 5;
  }

  if (pointsCount <= 20) {
    return 6;
  }

  return 8;
}

export function shouldOffsetXAxis(pointsCount: number): boolean {
  return pointsCount <= 5;
}
