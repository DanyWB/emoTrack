export const STATS_MIN_ENTRIES_FOR_DETAILED_SUMMARY = 3;

export function isLowDataStats(entriesCount: number): boolean {
  return entriesCount > 0 && entriesCount < STATS_MIN_ENTRIES_FOR_DETAILED_SUMMARY;
}
