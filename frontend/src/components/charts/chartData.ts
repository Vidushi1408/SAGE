import type { PeriodPoint } from "../../lib/periods";
import { isComplete } from "../../lib/periods";

export type Granularity = "daily" | "weekly" | "monthly";

export interface ForecastPoint { projected_period: string; projected_revenue: number; trend_fit?: string; r_squared?: number }
export interface DatedItem { date: string }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const labelOf = (p: PeriodPoint): string => p.date ?? p.week ?? p.month ?? "";

/** Short axis tick: "2026-10-03" -> "Oct 3", "2026-09-28/2026-10-04" -> "Sep 28", "2026-10" -> "Oct '26". */
export function shortLabel(label: string, granularity: Granularity): string {
  if (granularity === "monthly") {
    const [y, m] = label.split("-");
    return MONTHS[Number(m) - 1] ? `${MONTHS[Number(m) - 1]} '${y.slice(2)}` : label;
  }
  const start = label.split("/")[0];
  const [, m, d] = start.split("-");
  return MONTHS[Number(m) - 1] ? `${MONTHS[Number(m) - 1]} ${Number(d)}` : label;
}

/** Shorten a day, week or month label wherever it appears (insight charts get theirs from the backend); anything else is left alone. */
export function autoShortLabel(label: string): string {
  if (/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(label)) return shortLabel(label, "weekly");
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return shortLabel(label, "daily");
  if (/^\d{4}-\d{2}$/.test(label)) return shortLabel(label, "monthly");
  return label;
}

/** "Sep 28 – Oct 4" for a week, the plain short label otherwise. Used in tooltips and tables. */
export function longLabel(label: string, granularity: Granularity): string {
  if (granularity === "weekly" && label.includes("/")) {
    const [a, b] = label.split("/");
    return `${shortLabel(a, "daily")} – ${shortLabel(b, "daily")}`;
  }
  return shortLabel(label, granularity);
}

export function inPeriod(date: string, label: string, granularity: Granularity): boolean {
  if (granularity === "daily") return date === label;
  if (granularity === "monthly") return date.startsWith(label);
  const [start, end] = label.split("/");
  return !!end && date >= start && date <= end;
}

export interface TrendRow {
  label: string;
  /** Revenue of a finished period (solid line). */
  done: number | null;
  /** Revenue of an unfinished period, plus its finished neighbours so the dashed segment connects (dashed line). */
  open: number | null;
  /** The projected next period, anchored on the last finished one (dashed, lighter). */
  projected: number | null;
  revenue: number | null;
  transactions: number;
  anomalies: number;
  status: "complete" | "in-progress" | "projected";
  coverage?: string;
}

/**
 * Turn period metrics into the rows the revenue chart draws. Finished periods are solid; an unfinished one is
 * drawn dashed (so a half-month never reads as a collapse); the stored forecast extends the line as a lighter dash.
 */
export function buildTrendSeries(
  points: PeriodPoint[],
  opts: { granularity: Granularity; forecast?: ForecastPoint | null; anomalies?: DatedItem[] }
): TrendRow[] {
  const rows: TrendRow[] = points.map(p => {
    const complete = isComplete(p);
    const label = labelOf(p);
    return {
      label,
      done: complete ? p.revenue : null,
      open: complete ? null : p.revenue,
      projected: null,
      revenue: p.revenue,
      transactions: p.transactions,
      anomalies: (opts.anomalies ?? []).filter(a => inPeriod(a.date, label, opts.granularity)).length,
      status: complete ? "complete" : "in-progress",
      coverage: !complete && p.days_covered !== undefined ? `${p.days_covered} of ${p.days_in_period} days` : undefined,
    };
  });

  // Join each unfinished point to its finished neighbours so the dashed segment touches the solid line.
  rows.forEach((row, i) => {
    if (row.status !== "in-progress") return;
    for (const j of [i - 1, i + 1]) {
      if (rows[j] && rows[j].status === "complete") rows[j] = { ...rows[j], open: rows[j].revenue };
    }
  });

  const forecast = opts.forecast;
  if (forecast) {
    const anchorIdx = [...rows.keys()].reverse().find(i => rows[i].status === "complete");
    const existing = rows.findIndex(r => r.label === forecast.projected_period);
    if (anchorIdx !== undefined) rows[anchorIdx] = { ...rows[anchorIdx], projected: rows[anchorIdx].revenue };
    if (existing >= 0) {
      rows[existing] = { ...rows[existing], projected: forecast.projected_revenue };
    } else {
      rows.push({
        label: forecast.projected_period, done: null, open: null, projected: forecast.projected_revenue,
        revenue: null, transactions: 0, anomalies: 0, status: "projected",
      });
    }
  }
  return rows;
}

// ---------- calendar heatmap ----------

export interface CalendarCell { date: string; weekday: number; revenue: number | null; transactions: number; level: number }
export interface CalendarWeek { start: string; month: string | null; cells: (CalendarCell | null)[] }

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (s: string) => new Date(`${s}T00:00:00`);
/** 0 = Monday ... 6 = Sunday */
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

export const CALENDAR_LEVELS = 7;

/** Upper bounds that split the non-zero days into equal-sized groups, so one huge day doesn't wash out the rest. */
export function levelThresholds(values: number[], levels = CALENDAR_LEVELS): number[] {
  const sorted = values.filter(v => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return [];
  return Array.from({ length: levels - 1 }, (_, i) => sorted[Math.min(sorted.length - 1, Math.floor(((i + 1) / levels) * sorted.length))]);
}

/** 0..levels-1 for a revenue figure. */
export function levelFor(value: number, thresholds: number[], levels = CALENDAR_LEVELS): number {
  if (!thresholds.length) return 0;
  let level = 0;
  while (level < thresholds.length && value > thresholds[level]) level++;
  return Math.min(level, levels - 1);
}

/** Monday-first week columns covering the first to last day of data; days with no sales are `revenue: null`. */
export function buildCalendar(daily: { date?: string; revenue: number; transactions: number }[]): CalendarWeek[] {
  const days = daily.filter((d): d is { date: string; revenue: number; transactions: number } => !!d.date);
  if (!days.length) return [];
  const byDate = new Map(days.map(d => [d.date, d]));
  const thresholds = levelThresholds(days.map(d => d.revenue));
  const first = parseDay(days[0].date);
  const last = parseDay(days[days.length - 1].date);

  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - mondayIndex(first));
  const weeks: CalendarWeek[] = [];
  let lastMonth = -1;
  while (cursor <= last) {
    const cells: (CalendarCell | null)[] = [];
    let monthLabel: string | null = null;
    for (let wd = 0; wd < 7; wd++) {
      const date = isoDate(cursor);
      const inRange = cursor >= first && cursor <= last;
      if (!inRange) cells.push(null);
      else {
        const hit = byDate.get(date);
        cells.push({
          date, weekday: wd, revenue: hit ? hit.revenue : null, transactions: hit ? hit.transactions : 0,
          level: hit ? levelFor(hit.revenue, thresholds) : -1,
        });
        if (cursor.getMonth() !== lastMonth && monthLabel === null) { monthLabel = MONTHS[cursor.getMonth()]; lastMonth = cursor.getMonth(); }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push({ start: cells.find(Boolean)?.date ?? "", month: monthLabel, cells });
  }
  return weeks;
}

export const weekdayName = (date: string) => WEEKDAYS_LONG[parseDay(date).getDay()];

// ---------- rounded bars ----------

interface Corners { tl: number; tr: number; br: number; bl: number }

function roundedRectPath(left: number, top: number, w: number, h: number, c: Corners): string {
  return [
    `M${left + c.tl},${top}`, `H${left + w - c.tr}`, `Q${left + w},${top} ${left + w},${top + c.tr}`,
    `V${top + h - c.br}`, `Q${left + w},${top + h} ${left + w - c.br},${top + h}`,
    `H${left + c.bl}`, `Q${left},${top + h} ${left},${top + h - c.bl}`,
    `V${top + c.tl}`, `Q${left},${top} ${left + c.tl},${top}`, "Z",
  ].join(" ");
}

/**
 * SVG path for a bar rounded only at its data end (the end away from the baseline), square at the baseline.
 * Takes the box exactly as Recharts passes it to a custom `shape`:
 *  - vertical bars: positive values have y = top and height > 0; negative values have y = the bottom (data end)
 *    and height < 0, so the bar spans y + height (the baseline) to y;
 *  - horizontal bars: x is the baseline and width is negative when the value is negative (the bar extends left).
 */
export function roundedBarPath(
  box: { x: number; y: number; width: number; height: number },
  opts: { horizontal?: boolean; radius?: number } = {}
): string {
  const { x, y, width, height } = box;
  if (![x, y, width, height].every(Number.isFinite) || width === 0 || height === 0) return "";
  const requested = opts.radius ?? 4;

  if (opts.horizontal) {
    const w = Math.abs(width), h = Math.abs(height);
    const r = Math.min(requested, w, h / 2);
    const left = width < 0 ? x + width : x;
    return roundedRectPath(left, y, w, h, width < 0 ? { tl: r, bl: r, tr: 0, br: 0 } : { tr: r, br: r, tl: 0, bl: 0 });
  }

  const w = Math.abs(width), h = Math.abs(height);
  const r = Math.min(requested, w / 2, h);
  const top = height < 0 ? y + height : y;
  return roundedRectPath(x, top, w, h, height < 0 ? { bl: r, br: r, tl: 0, tr: 0 } : { tl: r, tr: r, bl: 0, br: 0 });
}
