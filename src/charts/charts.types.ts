export interface ChartPoint {
  date: string;
  mood?: number;
  energy?: number;
  stress?: number;
  sleepHours?: number;
  sleepQuality?: number;
}

export interface GeneratedCharts {
  combinedChartBuffer?: Buffer;
  sleepChartBuffer?: Buffer;
}
