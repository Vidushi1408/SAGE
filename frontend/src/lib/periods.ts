export interface PeriodPoint {
  week?: string;
  month?: string;
  date?: string;
  revenue: number;
  transactions: number;
  growth_pct: number | null;
  /** False while the data stops partway through the period. Older analyses have no flag; treat those as complete. */
  is_complete?: boolean;
  days_covered?: number;
  days_in_period?: number;
}

export const isComplete = (p: PeriodPoint): boolean => p.is_complete !== false;

/** The newest period whose growth could be calculated (both it and its predecessor were complete). */
export function latestComparableGrowth(periods: PeriodPoint[]): PeriodPoint | undefined {
  for (let i = periods.length - 1; i >= 0; i--) {
    const p = periods[i];
    if (isComplete(p) && p.growth_pct !== null && p.growth_pct !== undefined) return p;
  }
  return undefined;
}

/** The trailing period, only if the data stops partway through it. */
export function periodInProgress(periods: PeriodPoint[]): PeriodPoint | undefined {
  const last = periods[periods.length - 1];
  return last && !isComplete(last) ? last : undefined;
}
