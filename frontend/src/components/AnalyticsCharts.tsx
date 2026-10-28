"use client";

import React, { useMemo, useState } from "react";
import {
  Area, Bar, BarChart, Cell, ComposedChart, LabelList, Line, ReferenceDot, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, AreaChart
} from "recharts";
import { CalendarDays, CreditCard, LineChart as LineChartIcon, Package, PieChart as PieIcon, Sparkles, TrendingUp } from "lucide-react";
import { formatMoney } from "./ui";
import type { PeriodPoint } from "../lib/periods";
import { CATEGORICAL, INK, SEQUENTIAL, STATUS, compactMoney, foldTail } from "../lib/chartTheme";
import { AXIS_PROPS, BAR_CURSOR, Grid, LegendRow, MAX_BAR, RoundedBar, TooltipCard, useChartMotion } from "./charts/chartKit";
import { ChartPanel, EmptyChart } from "./charts/ChartPanel";
import DonutChart from "./charts/DonutChart";
import CalendarHeatmap from "./charts/CalendarHeatmap";
import { Granularity, ForecastPoint, TrendRow, buildTrendSeries, labelOf, longLabel, shortLabel } from "./charts/chartData";

const [C1, C2] = [CATEGORICAL[0], CATEGORICAL[1]];
// A period growing from near-zero revenue can swing to a huge %, which flattens every other bar to
// nothing on the same axis: cap what's *drawn* at this, while the tooltip always shows the real number.
const GROWTH_CAP = 200;

type CategoryRow = { category: string; revenue: number; volume: number; share_pct: number };
type PaymentRow = { method: string; revenue: number; volume: number; share_pct: number };
type QuantityRow = { quantity: number | string; avg_amount: number; count: number };
type DistRow = { range: string; count: number };
type Anomaly = { transaction_id: string; date: string; amount: number; reason: string; z_score: number };

interface ProfileShape {
  period_metrics?: { daily?: PeriodPoint[]; weekly?: PeriodPoint[]; monthly?: PeriodPoint[] };
  forecast?: { weekly?: ForecastPoint | null; monthly?: ForecastPoint | null };
  category_metrics?: { all_categories?: CategoryRow[] };
  payment_breakdown?: PaymentRow[];
  quantity_breakdown?: QuantityRow[];
  amount_distribution?: DistRow[];
  anomalies?: Anomaly[];
  correlations?: { amount_vs_quantity?: number };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const money = (v: unknown) => formatMoney(Number(v));
const pct = (v: unknown) => `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(1)}%`;
const GRANULARITY_NOUN: Record<Granularity, string> = { daily: "day", weekly: "week", monthly: "month" };

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-[#e6ddc9] bg-white p-0.5 text-xs" role="group" aria-label="Time granularity">
      {options.map(o => (
        <button
          key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${value === o.value ? "bg-[#9c6b3f] text-white" : "text-[#6d6062] hover:bg-[#f2e9dc]"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Ring-marked dots stay readable where they cross a line: a 2px surface ring is part of the mark. */
function RingDot({ cx, cy, color, hollow = false }: { cx?: number; cy?: number; color: string; hollow?: boolean }) {
  if (cx === undefined || cy === undefined) return <g />;
  return <circle cx={cx} cy={cy} r={5} fill={hollow ? INK.surface : color} stroke={hollow ? color : INK.surface} strokeWidth={2} />;
}

export default function AnalyticsCharts({ profile }: { profile: ProfileShape | null | undefined }) {
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const motion = useChartMotion();

  const daily = useMemo(() => profile?.period_metrics?.daily ?? [], [profile]);
  const weekly = useMemo(() => profile?.period_metrics?.weekly ?? [], [profile]);
  const monthly = useMemo(() => profile?.period_metrics?.monthly ?? [], [profile]);
  const series = granularity === "daily" ? daily : granularity === "monthly" ? monthly : weekly;

  const allCategories = useMemo(() => profile?.category_metrics?.all_categories ?? [], [profile]);
  const paymentBreakdown = profile?.payment_breakdown ?? [];
  const quantityBreakdown = profile?.quantity_breakdown ?? [];
  const amountDistribution = profile?.amount_distribution ?? [];
  const anomalies = useMemo(() => profile?.anomalies ?? [], [profile]);
  const correlation = profile?.correlations?.amount_vs_quantity;
  const forecast = granularity === "daily" ? null : profile?.forecast?.[granularity] ?? null;

  const trend = useMemo(
    () => buildTrendSeries(series, { granularity, forecast, anomalies }).map(r => ({ ...r, marker: r.anomalies > 0 ? r.revenue : null })),
    [series, granularity, forecast, anomalies]
  );
  const hasOpen = trend.some(r => r.status === "in-progress");
  const hasProjection = trend.some(r => r.status === "projected" || (r.projected !== null && r.status === "in-progress"));
  const hasMarkers = trend.some(r => r.marker !== null);

  const cumulative = useMemo(
    () => daily.reduce<{ date: string; total: number }[]>((acc, d) => {
      const before = acc.length ? acc[acc.length - 1].total : 0;
      acc.push({ date: d.date ?? "", total: Math.round((before + d.revenue) * 100) / 100 });
      return acc;
    }, []),
    [daily]
  );

  const byWeekday = useMemo(() => {
    const totals = WEEKDAYS.map(name => ({ name, revenue: 0, transactions: 0, days: 0 }));
    for (const d of daily) {
      if (!d.date) continue;
      const idx = (new Date(d.date + "T00:00:00").getDay() + 6) % 7; // 0=Mon..6=Sun
      const b = totals[idx];
      totals[idx] = { ...b, revenue: b.revenue + d.revenue, transactions: b.transactions + d.transactions, days: b.days + 1 };
    }
    return totals.map(b => ({ name: b.name, avgRevenue: b.days ? Math.round((b.revenue / b.days) * 100) / 100 : 0, transactions: b.transactions }));
  }, [daily]);
  const bestWeekday = byWeekday.reduce((best, d, i) => (d.avgRevenue > byWeekday[best].avgRevenue ? i : best), 0);

  const growthSeries = useMemo(
    () => series
      .filter(p => p.growth_pct !== null && p.growth_pct !== undefined)
      .map(p => ({ ...p, label: labelOf(p), growth_display: Math.max(-GROWTH_CAP, Math.min(GROWTH_CAP, p.growth_pct as number)) })),
    [series]
  );

  const categoryBars = useMemo(
    () => foldTail(allCategories.map(c => ({ name: c.category, revenue: c.revenue, volume: c.volume })), "name", ["revenue", "volume"], 8),
    [allCategories]
  );
  const anomalyPoints = useMemo(() => ({
    refunds: anomalies.filter(a => a.amount < 0),
    outliers: anomalies.filter(a => a.amount >= 0)
  }), [anomalies]);

  if (!(daily.length || weekly.length || monthly.length)) return null;

  const noun = GRANULARITY_NOUN[granularity];
  const trendLegend = [
    { label: "Revenue", color: C1, kind: "line" as const },
    ...(hasOpen ? [{ label: `In progress (unfinished ${noun})`, color: C1, kind: "dash" as const }] : []),
    ...(hasProjection ? [{ label: "Projected", color: C1, kind: "dash-light" as const }] : []),
    ...(hasMarkers ? [{ label: "Flagged transactions", color: STATUS.critical, kind: "dot" as const }] : []),
    { label: "Transactions", color: C2, kind: "dot" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[#3d3335] flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#9c6b3f]" /> Trends &amp; breakdowns
        </h2>
        <Segmented
          value={granularity} onChange={setGranularity}
          options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="xl:col-span-2">
          <ChartPanel
            index={0} height="h-96" icon={<LineChartIcon className="w-4 h-4" />}
            title="Revenue & transactions"
            subtitle={`${noun[0].toUpperCase()}${noun.slice(1)}ly totals. Dashed lines are unfinished or projected.`}
            summary={trend.length ? `Revenue by ${noun}, ${longLabel(trend[0].label, granularity)} to ${longLabel(trend[trend.length - 1].label, granularity)}${hasOpen ? ", with the latest unfinished period dashed" : ""}${hasProjection ? ", and a projection for the next period" : ""}.` : undefined}
            legend={<LegendRow items={trendLegend} />}
            table={{
              columns: [
                { key: "label", label: "Period", format: v => longLabel(String(v), granularity) },
                { key: "revenue", label: "Revenue", align: "right", format: v => (v === null ? "n/a" : money(v)) },
                { key: "projected", label: "Projected", align: "right", format: (v, row) => (row.status === "complete" || v === null ? "" : money(v)) },
                { key: "transactions", label: "Transactions", align: "right" },
                { key: "status", label: "Status", format: (v, row) => (v === "in-progress" ? `In progress${row.coverage ? ` (${row.coverage})` : ""}` : v === "projected" ? "Projected" : "Finished") },
              ],
              rows: trend as unknown as Record<string, unknown>[],
            }}
          >
            {trend.length ? (
              <div className="h-full flex flex-col min-h-0">
                <div className="flex-[3] min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trend} syncId="trend" margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <Grid />
                      <XAxis dataKey="label" tickFormatter={l => shortLabel(String(l), granularity)} minTickGap={28} {...AXIS_PROPS} />
                      <YAxis tickFormatter={v => compactMoney(Number(v))} width={48} {...AXIS_PROPS} />
                      <Tooltip cursor={{ stroke: INK.baseline }} content={({ payload }) => {
                        const row = payload?.[0]?.payload as (TrendRow & { marker: number | null }) | undefined;
                        if (!row) return null;
                        const rows = [];
                        if (row.revenue !== null) rows.push({ color: C1, text: `Revenue ${money(row.revenue)}` });
                        if (row.projected !== null && row.status !== "complete") rows.push({ color: C1, text: `Projected about ${money(row.projected)}` });
                        if (row.status !== "projected") rows.push({ color: C2, text: `${row.transactions} transactions` });
                        if (row.anomalies) rows.push({ color: STATUS.critical, text: `${row.anomalies} flagged transaction${row.anomalies === 1 ? "" : "s"}` });
                        const note = row.status === "in-progress"
                          ? `Still in progress${row.coverage ? `: ${row.coverage}` : ""}, so this is not a full ${noun}.`
                          : row.status === "projected" || row.projected !== null && row.status !== "complete"
                            ? "A straight-line estimate from recent finished periods, not a guarantee." : undefined;
                        return <TooltipCard title={longLabel(row.label, granularity)} rows={rows} note={note} />;
                      }} />
                      <Area dataKey="done" stroke="none" fill={C1} fillOpacity={0.1} connectNulls={false} activeDot={false} isAnimationActive={false} />
                      <Line dataKey="done" stroke={C1} strokeWidth={2} dot={false} activeDot={{ r: 5, fill: C1, stroke: INK.surface, strokeWidth: 2 }} connectNulls={false} {...motion} />
                      <Line dataKey="open" stroke={C1} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={false} connectNulls={false} {...motion} />
                      <Line dataKey="projected" stroke={C1} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" connectNulls={false}
                        dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload?: TrendRow }) =>
                          payload && payload.projected !== null && payload.status !== "complete" ? <RingDot cx={cx} cy={cy} color={C1} hollow /> : <g />}
                        activeDot={false} {...motion} />
                      <Line dataKey="marker" stroke="none" dot={({ cx, cy }: { cx?: number; cy?: number }) => <RingDot cx={cx} cy={cy} color={STATUS.critical} />} activeDot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend} syncId="trend" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <XAxis dataKey="label" hide />
                      <YAxis width={48} allowDecimals={false} tickCount={3} {...AXIS_PROPS} />
                      <Tooltip cursor={BAR_CURSOR} content={() => null} />
                      <Bar dataKey="transactions" fill={C2} maxBarSize={MAX_BAR} shape={(p: unknown) => <RoundedBar {...(p as object)} />} {...motion}>
                        {trend.map((r, i) => <Cell key={i} fill={C2} fillOpacity={r.status === "complete" ? 1 : 0.45} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : <EmptyChart label="No data for this granularity yet." />}
          </ChartPanel>
        </div>

        <ChartPanel
          index={1} height="h-72" icon={<TrendingUp className="w-4 h-4" />} title="Cumulative revenue" subtitle="Running total across the whole analysed period"
          table={{ columns: [{ key: "date", label: "Date" }, { key: "total", label: "Running total", align: "right", format: money }], rows: cumulative }}
        >
          {cumulative.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulative} margin={{ top: 16, right: 28, left: 0, bottom: 0 }}>
                <Grid />
                <XAxis dataKey="date" tickFormatter={d => shortLabel(String(d), "daily")} minTickGap={36} {...AXIS_PROPS} />
                <YAxis tickFormatter={v => compactMoney(Number(v))} width={48} {...AXIS_PROPS} />
                <Tooltip cursor={{ stroke: INK.baseline }} content={({ payload }) => {
                  const row = payload?.[0]?.payload as { date: string; total: number } | undefined;
                  return row ? <TooltipCard title={shortLabel(row.date, "daily")} rows={[{ color: C1, text: `Total ${money(row.total)}` }]} /> : null;
                }} />
                <Area type="monotone" dataKey="total" stroke={C1} strokeWidth={2} fill={C1} fillOpacity={0.1} dot={false} activeDot={{ r: 5, fill: C1, stroke: INK.surface, strokeWidth: 2 }} {...motion} />
                <ReferenceDot x={cumulative[cumulative.length - 1].date} y={cumulative[cumulative.length - 1].total} r={5} fill={C1} stroke={INK.surface} strokeWidth={2}
                  label={{ value: compactMoney(cumulative[cumulative.length - 1].total), position: "top", fill: INK.primary, fontSize: 11, fontWeight: 600 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="No daily data yet." />}
        </ChartPanel>

        <ChartPanel
          index={2} height="h-72" icon={<Sparkles className="w-4 h-4" />} title="Growth rate"
          subtitle={`Change from the previous ${noun}, between finished ${noun}s only`}
          legend={growthSeries.length ? <LegendRow items={[{ label: "Growth", color: STATUS.good }, { label: "Decline", color: STATUS.critical }]} /> : undefined}
          table={{ columns: [{ key: "label", label: "Period", format: v => longLabel(String(v), granularity) }, { key: "growth_pct", label: "Change", align: "right", format: pct }], rows: growthSeries as unknown as Record<string, unknown>[] }}
        >
          {growthSeries.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growthSeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <Grid />
                <XAxis dataKey="label" tickFormatter={l => shortLabel(String(l), granularity)} minTickGap={24} {...AXIS_PROPS} />
                <YAxis tickFormatter={v => `${v}%`} domain={[-GROWTH_CAP, GROWTH_CAP]} width={48} {...AXIS_PROPS} />
                <ReferenceLine y={0} stroke={INK.baseline} />
                <Tooltip cursor={BAR_CURSOR} content={({ payload }) => {
                  const row = payload?.[0]?.payload as { label: string; growth_pct: number } | undefined;
                  if (!row) return null;
                  const capped = Math.abs(row.growth_pct) > GROWTH_CAP ? "Drawn at the chart limit; the real change is larger." : undefined;
                  return <TooltipCard title={longLabel(row.label, granularity)} rows={[{ color: row.growth_pct < 0 ? STATUS.critical : STATUS.good, text: `${pct(row.growth_pct)} vs previous ${noun}` }]} note={capped} />;
                }} />
                <Bar dataKey="growth_display" maxBarSize={MAX_BAR} shape={(p: unknown) => <RoundedBar {...(p as object)} />} {...motion}>
                  {growthSeries.map((p, i) => <Cell key={i} fill={p.growth_display < 0 ? STATUS.critical : STATUS.good} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart label={`Growth needs two finished ${noun}s side by side. An unfinished ${noun} isn't compared.`} />}
        </ChartPanel>

        {daily.length >= 7 && (
          <div className="xl:col-span-2">
            <ChartPanel
              index={3} height="h-56" icon={<CalendarDays className="w-4 h-4" />} title="Sales calendar" subtitle="Each square is a day; darker means more revenue"
              table={{ columns: [{ key: "date", label: "Date" }, { key: "revenue", label: "Revenue", align: "right", format: money }, { key: "transactions", label: "Sales", align: "right" }], rows: daily as unknown as Record<string, unknown>[] }}
            >
              <CalendarHeatmap daily={daily} />
            </ChartPanel>
          </div>
        )}

        <ChartPanel
          index={4} icon={<CalendarDays className="w-4 h-4" />} title="Sales by day of week"
          subtitle={byWeekday.some(b => b.avgRevenue > 0) ? `${WEEKDAYS[bestWeekday]} is your strongest day on average` : "Average revenue per weekday"}
          table={{ columns: [{ key: "name", label: "Day" }, { key: "avgRevenue", label: "Avg. revenue", align: "right", format: money }, { key: "transactions", label: "Sales", align: "right" }], rows: byWeekday }}
        >
          {byWeekday.some(b => b.avgRevenue > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byWeekday} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
                <Grid />
                <XAxis dataKey="name" {...AXIS_PROPS} />
                <YAxis tickFormatter={v => compactMoney(Number(v))} width={48} {...AXIS_PROPS} />
                <Tooltip cursor={BAR_CURSOR} content={({ payload }) => {
                  const row = payload?.[0]?.payload as { name: string; avgRevenue: number; transactions: number } | undefined;
                  return row ? <TooltipCard title={row.name} rows={[{ color: C1, text: `Avg. revenue ${money(row.avgRevenue)}` }, { text: `${row.transactions} sales in total` }]} /> : null;
                }} />
                <Bar dataKey="avgRevenue" maxBarSize={MAX_BAR} shape={(p: unknown) => <RoundedBar {...(p as object)} />} {...motion}>
                  {byWeekday.map((_, i) => <Cell key={i} fill={i === bestWeekday ? C1 : SEQUENTIAL[2]} />)}
                  <LabelList dataKey="avgRevenue" content={(p: { x?: string | number; y?: string | number; width?: string | number; value?: unknown; index?: number }) =>
                    p.index === bestWeekday && p.x !== undefined && p.y !== undefined
                      ? <text x={Number(p.x) + Number(p.width ?? 0) / 2} y={Number(p.y) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK.primary}>{compactMoney(Number(p.value))}</text>
                      : null} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="No daily data yet." />}
        </ChartPanel>

        <ChartPanel
          index={5} height="h-60" icon={<PieIcon className="w-4 h-4" />} title="Revenue share by category"
          subtitle={allCategories.length > 6 ? "Top five, with the rest grouped as Other" : `${allCategories.length} categories`}
          table={{ columns: [{ key: "category", label: "Category" }, { key: "revenue", label: "Revenue", align: "right", format: money }, { key: "volume", label: "Orders", align: "right" }, { key: "share_pct", label: "Share", align: "right", format: v => `${Number(v).toFixed(1)}%` }], rows: allCategories as unknown as Record<string, unknown>[] }}
        >
          {allCategories.length ? <DonutChart slices={allCategories.map(c => ({ name: c.category, value: c.revenue }))} /> : <EmptyChart label="No category column recognised in this data." />}
        </ChartPanel>

        <ChartPanel
          index={6} height="h-60" icon={<PieIcon className="w-4 h-4" />} title="Revenue by category" subtitle="Ranked, highest first"
          table={{ columns: [{ key: "name", label: "Category" }, { key: "revenue", label: "Revenue", align: "right", format: money }, { key: "volume", label: "Orders", align: "right" }], rows: categoryBars as unknown as Record<string, unknown>[] }}
        >
          {categoryBars.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryBars} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={84} {...AXIS_PROPS} />
                <Tooltip cursor={BAR_CURSOR} content={({ payload }) => {
                  const row = payload?.[0]?.payload as { name: string; revenue: number; volume: number } | undefined;
                  return row ? <TooltipCard title={row.name} rows={[{ color: C1, text: money(row.revenue) }, { text: `${row.volume} orders` }]} /> : null;
                }} />
                <Bar dataKey="revenue" fill={C1} maxBarSize={MAX_BAR} shape={(p: unknown) => <RoundedBar {...(p as object)} horizontal />} {...motion}>
                  <LabelList dataKey="revenue" position="right" formatter={(v: unknown) => compactMoney(Number(v))} fill={INK.primary} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="No category column recognised in this data." />}
        </ChartPanel>

        {paymentBreakdown.length > 0 && (
          <ChartPanel
            index={7} height="h-60" icon={<CreditCard className="w-4 h-4" />} title="Payment methods" subtitle="Share of revenue by how customers paid"
            table={{ columns: [{ key: "method", label: "Method" }, { key: "revenue", label: "Revenue", align: "right", format: money }, { key: "volume", label: "Orders", align: "right" }, { key: "share_pct", label: "Share", align: "right", format: v => `${Number(v).toFixed(1)}%` }], rows: paymentBreakdown as unknown as Record<string, unknown>[] }}
          >
            <DonutChart slices={paymentBreakdown.map(p => ({ name: p.method, value: p.revenue }))} />
          </ChartPanel>
        )}

        {quantityBreakdown.length > 1 && (
          <ChartPanel
            index={8} icon={<Package className="w-4 h-4" />} title="Average sale by order size" subtitle="Average amount for orders of each quantity"
            table={{ columns: [{ key: "quantity", label: "Quantity" }, { key: "avg_amount", label: "Avg. sale", align: "right", format: money }, { key: "count", label: "Orders", align: "right" }], rows: quantityBreakdown as unknown as Record<string, unknown>[] }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={quantityBreakdown} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <Grid />
                <XAxis dataKey="quantity" tickFormatter={v => `Qty ${v}`} {...AXIS_PROPS} />
                <YAxis tickFormatter={v => compactMoney(Number(v))} width={48} {...AXIS_PROPS} />
                <Tooltip cursor={BAR_CURSOR} content={({ payload }) => {
                  const row = payload?.[0]?.payload as QuantityRow | undefined;
                  return row ? <TooltipCard title={`Quantity ${row.quantity}`} rows={[{ color: C1, text: `${money(row.avg_amount)} on average` }, { text: `${row.count} orders` }]} /> : null;
                }} />
                <Bar dataKey="avg_amount" fill={C1} maxBarSize={MAX_BAR} shape={(p: unknown) => <RoundedBar {...(p as object)} />} {...motion} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}

        {amountDistribution.length > 0 && (
          <ChartPanel
            index={9} icon={<PieIcon className="w-4 h-4" />} title="Transaction size distribution" subtitle="How many orders fall in each amount range"
            legend={amountDistribution.some(d => d.range.startsWith("Refunds")) ? <LegendRow items={[{ label: "Sales", color: C1 }, { label: "Refunds", color: STATUS.critical }]} /> : undefined}
            table={{ columns: [{ key: "range", label: "Amount range" }, { key: "count", label: "Orders", align: "right" }], rows: amountDistribution as unknown as Record<string, unknown>[] }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={amountDistribution} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <Grid />
                <XAxis dataKey="range" interval={0} angle={-20} textAnchor="end" height={54} {...AXIS_PROPS} tick={{ fill: INK.muted, fontSize: 9 }} />
                <YAxis allowDecimals={false} width={36} {...AXIS_PROPS} />
                <Tooltip cursor={BAR_CURSOR} content={({ payload }) => {
                  const row = payload?.[0]?.payload as DistRow | undefined;
                  return row ? <TooltipCard title={row.range} rows={[{ color: row.range.startsWith("Refunds") ? STATUS.critical : C1, text: `${row.count} orders` }]} /> : null;
                }} />
                <Bar dataKey="count" maxBarSize={MAX_BAR} shape={(p: unknown) => <RoundedBar {...(p as object)} />} {...motion}>
                  {amountDistribution.map((d, i) => <Cell key={i} fill={d.range.startsWith("Refunds") ? STATUS.critical : C1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}

        {anomalies.length > 0 && (
          <ChartPanel
            index={10} icon={<TrendingUp className="w-4 h-4" />} title="Anomalies over time" subtitle="Flagged outliers and refunds by date"
            legend={<LegendRow items={[{ label: "High-value outliers (circles)", color: C1 }, { label: "Refunds (diamonds)", color: C2 }]} />}
            table={{ columns: [{ key: "date", label: "Date" }, { key: "transaction_id", label: "Transaction" }, { key: "amount", label: "Amount", align: "right", format: money }, { key: "reason", label: "Reason" }], rows: anomalies as unknown as Record<string, unknown>[] }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <Grid />
                <XAxis dataKey="date" type="category" tickFormatter={d => shortLabel(String(d), "daily")} allowDuplicatedCategory={false} minTickGap={24} {...AXIS_PROPS} />
                <YAxis dataKey="amount" type="number" tickFormatter={v => compactMoney(Number(v))} width={52} {...AXIS_PROPS} />
                <ReferenceLine y={0} stroke={INK.baseline} />
                <Tooltip cursor={{ stroke: INK.baseline }} content={({ payload }) => {
                  const row = payload?.[0]?.payload as Anomaly | undefined;
                  return row ? <TooltipCard title={`${shortLabel(row.date, "daily")} · ${row.transaction_id}`} rows={[{ color: row.amount < 0 ? C2 : C1, text: `${money(row.amount)}: ${row.reason}` }]} /> : null;
                }} />
                <Scatter name="High-value outliers" data={anomalyPoints.outliers} fill={C1} stroke={INK.surface} strokeWidth={2} shape="circle" {...motion} />
                <Scatter name="Refunds" data={anomalyPoints.refunds} fill={C2} stroke={INK.surface} strokeWidth={2} shape="diamond" {...motion} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}
      </div>

      {typeof correlation === "number" && (
        <div className="glass-card p-4 flex items-center gap-3 text-xs text-[#6d6062] flex-wrap">
          <span className="font-bold text-[#3d3335]">Amount vs. quantity correlation:</span>
          <span className="font-semibold text-[#3d3335]">{correlation.toFixed(2)}</span>
          <span className="text-[#8a7d78]">
            {Math.abs(correlation) < 0.2 ? "— little to no relationship between order size and total amount."
              : Math.abs(correlation) < 0.5 ? "— a weak relationship between order size and total amount."
              : correlation > 0 ? "— larger orders tend to cost more, as expected."
              : "— larger orders tend to cost less, which is unusual and worth a look."}
          </span>
        </div>
      )}
    </div>
  );
}
