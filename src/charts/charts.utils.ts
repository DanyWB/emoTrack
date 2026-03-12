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

export function shouldRenderMoodHeatStrip(pointsCount: number): boolean {
  return pointsCount >= 3 && pointsCount <= 30;
}

export function resolveMoodHeatStripColor(mood?: number): string {
  if (typeof mood !== 'number') {
    return '#e2e8f0';
  }

  if (mood <= 2) {
    return '#ef4444';
  }

  if (mood <= 4) {
    return '#f97316';
  }

  if (mood <= 6) {
    return '#f59e0b';
  }

  if (mood <= 8) {
    return '#84cc16';
  }

  return '#16a34a';
}
