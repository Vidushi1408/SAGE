"use client";

import React from "react";
import { CartesianGrid } from "recharts";
import { INK } from "../../lib/chartTheme";
import { useReducedMotion } from "../../lib/motion";
import { roundedBarPath } from "./chartData";

/** Axis styling shared by every chart: recessive ink, no tick marks, a hairline baseline. */
export const AXIS_PROPS = {
  stroke: INK.baseline,
  tick: { fill: INK.muted, fontSize: 10 },
  tickLine: false,
  axisLine: { stroke: INK.baseline },
} as const;

/** Solid hairline horizontal grid (never dashed). */
export function Grid({ vertical = false }: { vertical?: boolean }) {
  return <CartesianGrid stroke={INK.grid} vertical={vertical} horizontal={!vertical} />;
}

/** Draw-in animation for marks, switched off entirely for people who ask for reduced motion. */
export function useChartMotion() {
  const reduced = useReducedMotion();
  return { isAnimationActive: !reduced, animationDuration: 700, animationEasing: "ease-out" as const };
}

export const BAR_CURSOR = { fill: "rgba(184, 96, 28, 0.07)" };
export const MAX_BAR = 24;

interface BarShapeProps { x?: number; y?: number; width?: number; height?: number; fill?: string; horizontal?: boolean }

/** Bar rounded only at its data end, square on the baseline. Pass as <Bar shape={<RoundedBar />} />. */
export function RoundedBar({ x = 0, y = 0, width = 0, height = 0, fill, horizontal }: BarShapeProps) {
  const d = roundedBarPath({ x, y, width, height }, { horizontal });
  return d ? <path d={d} fill={fill} /> : null;
}

export interface TooltipRowSpec { color?: string; text: string; dashed?: boolean }

/** Tooltip body: text stays in ink; a coloured swatch beside it carries the identity. */
export function TooltipCard({ title, rows, note }: { title?: string; rows: TooltipRowSpec[]; note?: string }) {
  return (
    <div className="sage-fade rounded-lg border border-[#e6ddc9] bg-[#fffdf8] px-3 py-2 text-[11px] shadow-lg" style={{ color: INK.primary }}>
      {title && <p className="font-semibold">{title}</p>}
      {rows.map((r, i) => (
        <p key={i} className="mt-0.5 flex items-center gap-1.5" style={{ color: INK.secondary }}>
          {r.color && <span aria-hidden className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />}
          <span style={{ color: INK.primary }}>{r.text}</span>
        </p>
      ))}
      {note && <p className="mt-1 text-[10px]" style={{ color: INK.muted }}>{note}</p>}
    </div>
  );
}

export interface LegendItem { label: string; color: string; kind?: "dot" | "line" | "dash" | "dash-light"; value?: string; share?: string }

/** HTML legend (text in ink, identity from the swatch). Always shown when a chart has two or more series. */
export function LegendRow({ items }: { items: LegendItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: INK.secondary }}>
      {items.map(item => (
        <li key={item.label} className="flex items-center gap-1.5">
          <Swatch color={item.color} kind={item.kind} />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function Swatch({ color, kind = "dot" }: { color: string; kind?: LegendItem["kind"] }) {
  if (kind === "line") return <span aria-hidden className="inline-block w-4 h-0.5 rounded" style={{ background: color }} />;
  if (kind === "dash" || kind === "dash-light") {
    return <span aria-hidden className="inline-block w-4 h-0" style={{ borderTop: `2px dashed ${color}`, opacity: kind === "dash-light" ? 0.6 : 1 }} />;
  }
  return <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />;
}
