"use client";

import React, { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { INK, colorFor, compactMoney, foldTail } from "../../lib/chartTheme";
import { formatMoney } from "../ui";
import { Swatch, TooltipCard, useChartMotion } from "./chartKit";

export interface Slice { name: string; value: number }

/**
 * Part-to-whole donut: at most six slices (the tail folds into "Other"), colour follows the name, the centre
 * shows the total or whichever slice you point at, and a legend lists every slice with its value and share.
 */
export default function DonutChart({ slices, centreLabel = "total", format = formatMoney, centreFormat = compactMoney }: {
  slices: Slice[]; centreLabel?: string; format?: (v: number) => string; centreFormat?: (v: number) => string;
}) {
  const motion = useChartMotion();
  const [active, setActive] = useState<number | null>(null);

  const data = useMemo(() => {
    const sorted = [...slices].filter(s => s.value > 0).sort((a, b) => b.value - a.value);
    return foldTail(sorted, "name", ["value"]);
  }, [slices]);
  const total = data.reduce((sum, s) => sum + s.value, 0);
  const focus = active !== null ? data[active] : null;

  return (
    <div className="h-full flex flex-col sm:flex-row items-center gap-4">
      <div className="relative w-44 h-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={({ payload }) => {
              const row = payload?.[0]?.payload as Slice | undefined;
              return row ? <TooltipCard title={row.name} rows={[{ color: colorFor(row.name), text: `${format(row.value)} · ${((row.value / total) * 100).toFixed(1)}%` }]} /> : null;
            }} />
            <Pie
              data={data} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="94%" paddingAngle={0}
              stroke={INK.surface} strokeWidth={2} startAngle={90} endAngle={-270}
              onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)} {...motion}
            >
              {data.map((s, i) => <Cell key={s.name} fill={colorFor(s.name)} opacity={active === null || active === i ? 1 : 0.35} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
          <span className="text-lg font-bold leading-tight" style={{ color: INK.primary }}>{centreFormat(focus ? focus.value : total)}</span>
          <span className="text-[10px] leading-tight mt-0.5 truncate max-w-full" style={{ color: INK.muted }}>{focus ? focus.name : centreLabel}</span>
        </div>
      </div>

      <ul className="flex-1 w-full min-w-0 space-y-1 text-[11px]">
        {data.map((s, i) => (
          <li
            key={s.name}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
            className={`flex items-center gap-2 rounded px-1.5 py-1 transition-colors ${active === i ? "bg-[#f2e9dc]" : ""}`}
          >
            <Swatch color={colorFor(s.name)} />
            <span className="flex-1 truncate" style={{ color: INK.primary }}>{s.name}</span>
            <span className="tabular-nums" style={{ color: INK.secondary }}>{format(s.value)}</span>
            <span className="w-10 text-right tabular-nums" style={{ color: INK.muted }}>{((s.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
