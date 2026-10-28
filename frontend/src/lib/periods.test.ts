import { describe, it, expect } from "vitest";
import { isComplete, latestComparableGrowth, periodInProgress, PeriodPoint } from "./periods";

const week = (label: string, growth: number | null, extra: Partial<PeriodPoint> = {}): PeriodPoint =>
  ({ week: label, revenue: 100, transactions: 1, growth_pct: growth, ...extra });

describe("period helpers", () => {
  it("treats a period without a flag as complete (analyses saved before the flag existed)", () => {
    expect(isComplete(week("w1", 5))).toBe(true);
    expect(isComplete(week("w1", 5, { is_complete: false }))).toBe(false);
  });

  it("skips an in-progress week and reports the latest comparable one", () => {
    const periods = [week("w1", null), week("w2", 12.5), week("w3", null, { is_complete: false })];
    expect(latestComparableGrowth(periods)?.week).toBe("w2");
    expect(periodInProgress(periods)?.week).toBe("w3");
  });

  it("keeps a genuine 0% growth rather than treating it as missing", () => {
    expect(latestComparableGrowth([week("w1", null), week("w2", 0)])?.growth_pct).toBe(0);
  });

  it("returns nothing when no growth can be compared", () => {
    expect(latestComparableGrowth([week("w1", null)])).toBeUndefined();
    expect(latestComparableGrowth([])).toBeUndefined();
    expect(periodInProgress([week("w1", 3)])).toBeUndefined();
    expect(periodInProgress([])).toBeUndefined();
  });
});
