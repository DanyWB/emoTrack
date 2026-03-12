export interface ChartPoint {
  date: string;
  mood?: number;
  energy?: number;
  stress?: number;
  sleepHours?: number;
  sleepQuality?: number;
  hasEvent?: boolean;
  isBestDay?: boolean;
  isWorstDay?: boolean;
  isSleepMissing?: boolean;
}

export interface GeneratedCharts {
  combinedChartBuffer?: Buffer;
  sleepChartBuffer?: Buffer;
  moodHeatStripBuffer?: Buffer;
}
