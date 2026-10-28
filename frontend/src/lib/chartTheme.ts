/**
 * Chart colours and helpers. The values mirror the --viz-* tokens in globals.css (SVG attributes need real
 * colours, not var()s, in some places) and were validated with the dataviz palette validator.
 * Re-run it if you change a hex:  validate_palette.js "<hex,hex,...>" --mode light --surface "#fffdf8"
 */
export const CATEGORICAL = ["#b8601c", "#0b8da3", "#c99a12", "#8f4aa0", "#4a8a3a", "#d9607a", "#3b5db5", "#b5352e"] as const;
export const OTHER_COLOR = "#a89b93";
export const SEQUENTIAL = ["#f6e7d4", "#edcfaa", "#e0a974", "#cf8444", "#b8601c", "#8f4510", "#66300a"] as const;
export const STATUS = { good: "#0ca30c", critical: "#d03b3b" } as const;
export const INK = { primary: "#3d3335", secondary: "#6d6062", muted: "#8a7d78", grid: "#ece2ce", baseline: "#d9cdb8", surface: "#fffdf8" } as const;

export const OTHER_LABEL = "Other";
/** Most slices a part-to-whole chart shows before the rest fold into "Other". */
export const MAX_SLICES = 6;

/**
 * Colour follows the entity, never its rank: the first time a name is seen it takes the next free slot and
 * keeps it, so filtering or re-sorting never repaints the survivors. Past the 8 slots, names share "Other" grey.
 */
const registry = new Map<string, number>();

export function colorFor(name: string): string {
  if (name === OTHER_LABEL) return OTHER_COLOR;
  if (!registry.has(name)) registry.set(name, registry.size);
  const slot = registry.get(name) as number;
  return slot < CATEGORICAL.length ? CATEGORICAL[slot] : OTHER_COLOR;
}

/** Test hook: forget all assignments. */
export function resetColorRegistry(): void {
  registry.clear();
}

/**
 * Keep the largest `max - 1` entries and fold the rest into one "Other" entry (summing the numeric `keys`),
 * so a donut never shows more than `max` slices. Rows must already be sorted largest-first.
 */
export function foldTail<T extends Record<string, unknown>>(rows: T[], nameKey: keyof T, sumKeys: (keyof T)[], max = MAX_SLICES): T[] {
  if (rows.length <= max) return rows;
  const head = rows.slice(0, max - 1);
  const tail = rows.slice(max - 1);
  const other: Record<string, unknown> = { [nameKey as string]: OTHER_LABEL };
  for (const k of sumKeys) other[k as string] = Math.round(tail.reduce((sum, r) => sum + (Number(r[k]) || 0), 0) * 100) / 100;
  return [...head, other as T];
}

/** 1234 -> "1.2K", 1_500_000 -> "1.5M"; small values keep their decimals. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim(value / 1_000)}K`;
  return trim(value);
}
const trim = (n: number) => String(Math.round(n * 10) / 10);

export const compactMoney = (value: number) => `${value < 0 ? "-" : ""}$${compactNumber(Math.abs(value))}`;
