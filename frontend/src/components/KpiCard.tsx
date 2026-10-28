"use client";

import React from "react";
import { useCountUp } from "../lib/motion";
import { CATEGORICAL } from "../lib/chartTheme";

/** A tiny trend line with no axes; the value above it carries the numbers. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 96, h = 28, pad = 3;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i * (w - 2 * pad)) / (values.length - 1), h - pad - ((v - min) / span) * (h - 2 * pad)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="shrink-0">
      <path d={d} fill="none" stroke={CATEGORICAL[0]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3} fill={CATEGORICAL[0]} stroke="#fffdf8" strokeWidth={1.5} />
    </svg>
  );
}

interface KpiProps {
  label: string;
  /** Numeric value (counts up); `format` renders it. Omit with `text` for a non-numeric value. */
  value?: number | null;
  format?: (n: number) => string;
  text?: string;
  hint: string;
  icon: React.ReactNode;
  tone: string;
  trend?: number[];
  trendLabel?: string;
  index?: number;
}

function CountedValue({ value, format }: { value: number; format: (n: number) => string }) {
  const shown = useCountUp(value);
  return <span aria-label={format(value)}>{format(shown)}</span>;
}

export default function KpiCard({ label, value, format = String, text, hint, icon, tone, trend, trendLabel, index = 0 }: KpiProps) {
  return (
    <div className="glass-card sage-lift sage-reveal p-6 flex flex-col justify-between gap-4" style={{ "--i": index } as React.CSSProperties}>
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-[#8a7d78] uppercase tracking-widest">{label}</span>
        <div className={`p-2 rounded-lg ${tone}`}>{icon}</div>
      </div>
      <div className="space-y-1">
        <div className="flex items-end justify-between gap-2">
          <div className="text-2xl font-bold text-[#3d3335] tabular-nums">
            {value !== null && value !== undefined ? <CountedValue value={value} format={format} /> : text ?? "n/a"}
          </div>
          {trend && <Sparkline values={trend} label={trendLabel ?? `${label} trend`} />}
        </div>
        <div className="text-[10px] text-[#8a7d78]">{hint}</div>
      </div>
    </div>
  );
}
