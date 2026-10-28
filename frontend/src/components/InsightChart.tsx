"use client";

import React from "react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InsightObject } from "../lib/api";
import { CATEGORICAL, INK, compactMoney } from "../lib/chartTheme";
import { formatMoney } from "./ui";
import { AXIS_PROPS, BAR_CURSOR, Grid, MAX_BAR, RoundedBar, TooltipCard, useChartMotion } from "./charts/chartKit";
import DonutChart from "./charts/DonutChart";
import { autoShortLabel } from "./charts/chartData";

const C1 = CATEGORICAL[0];

/** One insight's chart: a trend (area), a ranking (bars) or a part-to-whole (donut), in the shared chart style. */
export default function InsightChart({ insight, idx = 0 }: { insight: InsightObject; idx?: number }) {
  const motion = useChartMotion();
  const hasChart = insight.chart_type !== "none" && insight.chart_data && insight.chart_data.length > 0;
  if (!hasChart) return null;

  const tooltip = ({ payload }: { payload?: readonly { payload?: unknown }[] }) => {
    const row = payload?.[0]?.payload as { name: string; value: number } | undefined;
    return row ? <TooltipCard title={autoShortLabel(row.name)} rows={[{ color: C1, text: formatMoney(row.value) }]} /> : null;
  };
  const summary = `${insight.title}: ${insight.chart_data.length} data points`;

  if (insight.chart_type === "pie") {
    return (
      <div className="h-52 mt-2 w-full" role="img" aria-label={summary} data-chart={idx}>
        <DonutChart slices={insight.chart_data.map(d => ({ name: String(d.name), value: Number(d.value) }))} />
      </div>
    );
  }

  return (
    <div className="h-60 mt-2 w-full" role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        {insight.chart_type === "line" || insight.chart_type === "area" ? (
          <AreaChart data={insight.chart_data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <Grid />
            <XAxis dataKey="name" tickFormatter={n => autoShortLabel(String(n))} minTickGap={24} {...AXIS_PROPS} />
            <YAxis tickFormatter={v => compactMoney(Number(v))} width={48} {...AXIS_PROPS} />
            <Tooltip cursor={{ stroke: INK.baseline }} content={tooltip} />
            <Area type="monotone" dataKey="value" stroke={C1} strokeWidth={2} fill={C1} fillOpacity={0.1} dot={false}
              activeDot={{ r: 5, fill: C1, stroke: INK.surface, strokeWidth: 2 }} {...motion} />
          </AreaChart>
        ) : (
          <BarChart data={insight.chart_data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <Grid />
            <XAxis dataKey="name" tickFormatter={n => autoShortLabel(String(n))} minTickGap={8} {...AXIS_PROPS} />
            <YAxis tickFormatter={v => compactMoney(Number(v))} width={48} {...AXIS_PROPS} />
            <Tooltip cursor={BAR_CURSOR} content={tooltip} />
            <Bar dataKey="value" fill={C1} maxBarSize={MAX_BAR} shape={(p: unknown) => <RoundedBar {...(p as object)} />} {...motion} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
