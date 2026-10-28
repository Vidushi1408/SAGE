import { describe, it, expect } from "vitest";
import { autoShortLabel, buildCalendar, buildTrendSeries, inPeriod, levelFor, levelThresholds, longLabel, roundedBarPath, shortLabel, weekdayName } from "./chartData";
import type { PeriodPoint } from "../../lib/periods";

const month = (m: string, revenue: number, extra: Partial<PeriodPoint> = {}): PeriodPoint =>
  ({ month: m, revenue, transactions: 10, growth_pct: null, is_complete: true, ...extra });

describe("labels", () => {
  it("shortens ticks by granularity", () => {
    expect(shortLabel("2026-10-03", "daily")).toBe("Oct 3");
    expect(shortLabel("2026-09-28/2026-10-04", "weekly")).toBe("Sep 28");
    expect(shortLabel("2026-10", "monthly")).toBe("Oct '26");
    expect(shortLabel("weird", "monthly")).toBe("weird");
  });

  it("writes a week as a range for tooltips", () => {
    expect(longLabel("2026-09-28/2026-10-04", "weekly")).toBe("Sep 28 – Oct 4");
    expect(longLabel("2026-10", "monthly")).toBe("Oct '26");
  });

  it("matches dates to daily, weekly and monthly periods", () => {
    expect(inPeriod("2026-10-03", "2026-10-03", "daily")).toBe(true);
    expect(inPeriod("2026-10-03", "2026-10", "monthly")).toBe(true);
    expect(inPeriod("2026-11-01", "2026-10", "monthly")).toBe(false);
    expect(inPeriod("2026-10-04", "2026-09-28/2026-10-04", "weekly")).toBe(true);
    expect(inPeriod("2026-10-05", "2026-09-28/2026-10-04", "weekly")).toBe(false);
  });
});

describe("autoShortLabel", () => {
  it("shortens ISO days, weeks and months and leaves other labels alone", () => {
    expect(autoShortLabel("2026-10-05/2026-10-11")).toBe("Oct 5");
    expect(autoShortLabel("2026-10-05")).toBe("Oct 5");
    expect(autoShortLabel("2026-10")).toBe("Oct '26");
    expect(autoShortLabel("Sandwiches")).toBe("Sandwiches");
    expect(autoShortLabel("2026-W20")).toBe("2026-W20");
  });
});

describe("buildTrendSeries", () => {
  const history = [month("2026-07", 100), month("2026-08", 200), month("2026-09", 300), month("2026-10", 40, { is_complete: false, days_covered: 2, days_in_period: 31 })];

  it("draws finished periods solid and the unfinished one dashed, joined to its neighbour", () => {
    const rows = buildTrendSeries(history, { granularity: "monthly" });
    expect(rows.map(r => r.done)).toEqual([100, 200, 300, null]);
    expect(rows.map(r => r.open)).toEqual([null, null, 300, 40]); // 2026-09 repeats so the dashes touch the line
    expect(rows[3]).toMatchObject({ status: "in-progress", coverage: "2 of 31 days" });
    expect(rows[2].status).toBe("complete");
  });

  it("joins a partial first period to the next finished one", () => {
    const rows = buildTrendSeries([month("2026-01", 10, { is_complete: false }), month("2026-02", 100), month("2026-03", 120)], { granularity: "monthly" });
    expect(rows.map(r => r.open)).toEqual([10, 100, null]);
  });

  it("adds the forecast as a new projected row anchored on the last finished period", () => {
    const rows = buildTrendSeries([month("2026-07", 100), month("2026-08", 200), month("2026-09", 300)], {
      granularity: "monthly", forecast: { projected_period: "2026-10", projected_revenue: 400 },
    });
    expect(rows).toHaveLength(4);
    expect(rows[2].projected).toBe(300);
    expect(rows[3]).toMatchObject({ label: "2026-10", projected: 400, status: "projected", done: null, revenue: null });
  });

  it("puts the forecast on the in-progress period when that is the one being projected", () => {
    const rows = buildTrendSeries(history, { granularity: "monthly", forecast: { projected_period: "2026-10", projected_revenue: 400 } });
    expect(rows).toHaveLength(4);
    expect(rows[3]).toMatchObject({ open: 40, projected: 400, status: "in-progress" });
    expect(rows[2].projected).toBe(300);
  });

  it("counts anomalies in each period", () => {
    const rows = buildTrendSeries(history, { granularity: "monthly", anomalies: [{ date: "2026-08-02" }, { date: "2026-08-20" }, { date: "2026-10-01" }] });
    expect(rows.map(r => r.anomalies)).toEqual([0, 2, 0, 1]);
  });

  it("treats periods from older analyses (no flag) as finished", () => {
    const rows = buildTrendSeries([{ month: "2026-07", revenue: 5, transactions: 1, growth_pct: null }], { granularity: "monthly" });
    expect(rows[0]).toMatchObject({ done: 5, open: null, status: "complete" });
  });

  it("copes with no data", () => {
    expect(buildTrendSeries([], { granularity: "weekly" })).toEqual([]);
  });
});

describe("calendar heatmap", () => {
  // 2026-10-05 is a Monday; data runs Wed 7 Oct .. Tue 13 Oct with no sales on the 10th.
  const daily = [
    { date: "2026-10-07", revenue: 10, transactions: 1 }, { date: "2026-10-08", revenue: 20, transactions: 2 },
    { date: "2026-10-09", revenue: 30, transactions: 3 }, { date: "2026-10-11", revenue: 500, transactions: 9 },
    { date: "2026-10-12", revenue: 40, transactions: 4 }, { date: "2026-10-13", revenue: 50, transactions: 5 },
  ];

  it("lays days out in Monday-first week columns, leaving cells outside the data empty", () => {
    const weeks = buildCalendar(daily);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].cells.map(c => c?.date ?? null)).toEqual([null, null, "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(weeks[1].cells.slice(0, 2).map(c => c?.date)).toEqual(["2026-10-12", "2026-10-13"]);
    expect(weeks[1].cells.slice(2)).toEqual([null, null, null, null, null]);
  });

  it("marks a day without sales as empty, not as the lowest level", () => {
    const quiet = buildCalendar(daily)[0].cells[5];
    expect(quiet).toMatchObject({ date: "2026-10-10", revenue: null, level: -1 });
  });

  it("labels the first week of each month once", () => {
    const weeks = buildCalendar([{ date: "2026-10-28", revenue: 1, transactions: 1 }, { date: "2026-11-03", revenue: 1, transactions: 1 }, { date: "2026-11-10", revenue: 1, transactions: 1 }]);
    expect(weeks.map(w => w.month)).toEqual(["Oct", "Nov", null]);
  });

  it("spreads levels evenly so one huge day doesn't wash out the others", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100000];
    const t = levelThresholds(values);
    expect(t).toHaveLength(6);
    const levels = values.map(v => levelFor(v, t));
    expect(levels[0]).toBe(0);
    expect(levels[9]).toBe(6);
    expect(new Set(levels).size).toBeGreaterThanOrEqual(6);
  });

  it("handles all-zero and empty input", () => {
    expect(levelThresholds([0, 0])).toEqual([]);
    expect(levelFor(5, [])).toBe(0);
    expect(buildCalendar([])).toEqual([]);
  });

  it("names the weekday of a date", () => {
    expect(weekdayName("2026-10-05")).toBe("Monday");
  });
});

describe("roundedBarPath", () => {
  // Boxes below are exactly what Recharts 3 passes to a custom shape (measured, not assumed).
  it("rounds only the top of an upward bar and keeps the baseline square", () => {
    const d = roundedBarPath({ x: 76.5, y: 5, width: 92, height: 80 });
    expect(d.startsWith("M80.5,5 H164.5")).toBe(true); // 4px in from each top corner
    expect(d).toContain("Q76.5,5 80.5,5"); // curved top-left
    expect(d).toContain("Q168.5,5 168.5,9"); // curved top-right
    expect(d).toContain("Q76.5,85 76.5,85"); // zero-radius (square) at the baseline y=85
  });

  it("rounds the bottom of a negative bar, whose y is its data end and baseline is y + height", () => {
    const d = roundedBarPath({ x: 191.5, y: 125, width: 92, height: -40 });
    expect(d.startsWith("M191.5,85 H283.5")).toBe(true); // top edge sits on the baseline (y=85), square
    expect(d).toContain("Q283.5,125 279.5,125"); // curved bottom-right
    expect(d).toContain("Q191.5,125 191.5,121"); // curved bottom-left
  });

  it("rounds the right end of a horizontal bar", () => {
    const d = roundedBarPath({ x: 180, y: 13, width: 115, height: 64 }, { horizontal: true });
    expect(d).toContain("Q295,13 295,17"); // curved top-right
    expect(d.startsWith("M180,13 H291")).toBe(true); // square at the left baseline
  });

  it("rounds the left end of a horizontal bar with a negative value", () => {
    const d = roundedBarPath({ x: 180, y: 93, width: -57.5, height: 64 }, { horizontal: true });
    expect(d).toContain("Q122.5,93 126.5,93"); // curved top-left at the data end (x=122.5)
    expect(d).toContain("H180"); // runs out to the square baseline edge
  });

  it("never rounds more than the bar can take", () => {
    expect(roundedBarPath({ x: 0, y: 0, width: 4, height: 2 })).toContain("Q0,0 2,0"); // radius shrinks to fit
  });

  it("draws nothing for an empty or invalid bar", () => {
    expect(roundedBarPath({ x: 0, y: 0, width: 10, height: 0 })).toBe("");
    expect(roundedBarPath({ x: 0, y: 0, width: NaN, height: 5 })).toBe("");
  });
});
