export interface AverageScores {
  mood: number | null;
  energy: number | null;
  stress: number | null;
}

export function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
