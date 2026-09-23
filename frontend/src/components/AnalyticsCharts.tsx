"use client";

import React, { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter,
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import { CalendarDays, CreditCard, LineChart as LineChartIcon, Package, PieChart as PieIcon, TrendingUp } from "lucide-react";
import { formatMoney } from "./ui";

// ---- Palette (matches the app theme: peanut / pebble / wool / slate) ----
const PEANUT = "#9c6b3f";
const PEANUT_LT = "#cca87c";
const PEBBLE = "#9c8480";
const WOOL_DK = "#a08a5c";
const SLATE_FAINT = "#a89b93";
const BORDER = "#ece2ce";
const GREEN = "#5f7a58";
const ROSE = "#b0564f";
// A period growing from near-zero revenue can swing to a huge %, which flattens every other bar to
// nothing on the same axis — cap what's *drawn* at this, while the tooltip always shows the real number.
const GROWTH_CAP = 200;
const PIE_COLORS = [PEANUT, PEBBLE, WOOL_DK, "#6d7a8a", PEANUT_LT, "#7d6864", "#5c6b5f", "#b9855a"];

type PeriodPoint = { date?: string; week?: string; month?: string; revenue: number; transactions: number; growth_pct: number | null };
type CategoryRow = { category: string; revenue: number; volume: number; share_pct: number };
type PaymentRow = { method: string; revenue: number; volume: number; share_pct: number };
type QuantityRow = { quantity: number | string; avg_amount: number; count: number };
type DistRow = { range: string; count: number };
type Anomaly = { transaction_id: string; date: string; amount: number; reason: string; z_score: number };

interface ProfileShape {
  period_metrics?: { daily?: PeriodPoint[]; weekly?: PeriodPoint[]; monthly?: PeriodPoint[] };
  category_metrics?: { all_categories?: CategoryRow[] };
  payment_breakdown?: PaymentRow[];
  quantity_breakdown?: QuantityRow[];
  amount_distribution?: DistRow[];
  anomalies?: Anomaly[];
  correlations?: { amount_vs_quantity?: number };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function periodLabel(p: PeriodPoint): string {
  return p.date ?? p.week ?? p.month ?? "";
}

function Panel({ title, subtitle, icon, children, tall }: {
  title: string; subtitle?: string; icon: React.ReactNode; children: React.ReactNode; tall?: boolean;
}) {
  return (
    <section className="glass-card p-6 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <div className="p-1.5 rounded-lg bg-[#f2e9dc] text-[#9c6b3f] shrink-0 mt-0.5">{icon}</div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#3d3335]">{title}</h3>
          {subtitle && <p className="text-[11px] text-[#8a7d78] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className={tall ? "h-72" : "h-56"}>{children}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="h-full flex items-center justify-center text-xs text-[#a89b93]">{label}</div>;
}

const tooltipStyle: React.CSSProperties = {
  background: "#fffdf8", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px",
  fontSize: 11, boxShadow: "0 4px 14px rgba(61,51,53,0.08)"
};

type TooltipRow = { value: number; name: string; color?: string; payload: Record<string, unknown> };

/** One custom tooltip, reused everywhere: each chart supplies a small `line` formatter for its own data shape. */
function ChartTooltip({ active, payload, line }: {
  active?: boolean;
  payload?: TooltipRow[];
  line: (row: TooltipRow) => React.ReactNode;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={tooltipStyle}>
      {payload.map((row, i) => (
        <p key={i} style={{ color: row.color || "#3d3335", margin: i === 0 ? 0 : "2px 0 0" }}>{line(row)}</p>
      ))}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-[#e6ddc9] bg-white p-0.5 text-xs">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${value === o.value ? "bg-[#9c6b3f] text-white" : "text-[#6d6062] hover:bg-[#f2e9dc]"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AnalyticsCharts({ profile }: { profile: ProfileShape | null | undefined }) {
  const [granularity, setGranularity] = useState<"daily" | "weekly" | "monthly">("weekly");

  const daily = useMemo(() => profile?.period_metrics?.daily ?? [], [profile]);
  const weekly = useMemo(() => profile?.period_metrics?.weekly ?? [], [profile]);
  const monthly = useMemo(() => profile?.period_metrics?.monthly ?? [], [profile]);
  const series = granularity === "daily" ? daily : granularity === "monthly" ? monthly : weekly;

  const allCategories = profile?.category_metrics?.all_categories ?? [];
  const paymentBreakdown = profile?.payment_breakdown ?? [];
  const quantityBreakdown = profile?.quantity_breakdown ?? [];
  const amountDistribution = profile?.amount_distribution ?? [];
  const anomalies = useMemo(() => profile?.anomalies ?? [], [profile]);
  const correlation = profile?.correlations?.amount_vs_quantity;

  // Running total across the whole window — built without mutating an outer accumulator.
  const cumulative = useMemo(
    () => daily.map((_, i) => ({
      date: daily[i].date,
      total: Math.round(daily.slice(0, i + 1).reduce((sum, d) => sum + d.revenue, 0) * 100) / 100
    })),
    [daily]
  );

  const byWeekday = useMemo(() => {
    const totals = WEEKDAYS.map(name => ({ name, revenue: 0, transactions: 0, days: 0 }));
    for (const d of daily) {
      if (!d.date) continue;
      const jsDay = new Date(d.date + "T00:00:00").getDay(); // 0=Sun..6=Sat
      const idx = (jsDay + 6) % 7; // shift to 0=Mon..6=Sun
      const bucket = totals[idx];
      totals[idx] = { ...bucket, revenue: bucket.revenue + d.revenue, transactions: bucket.transactions + d.transactions, days: bucket.days + 1 };
    }
    return totals.map(b => ({ name: b.name, avgRevenue: b.days ? Math.round((b.revenue / b.days) * 100) / 100 : 0, transactions: b.transactions }));
  }, [daily]);

  const growthSeries = useMemo(
    () => series
      .filter(p => p.growth_pct !== null && p.growth_pct !== undefined)
      .map(p => ({ ...p, growth_display: Math.max(-GROWTH_CAP, Math.min(GROWTH_CAP, p.growth_pct as number)) })),
    [series]
  );

  const anomalyPoints = useMemo(() => ({
    refunds: anomalies.filter(a => a.amount < 0),
    outliers: anomalies.filter(a => a.amount >= 0)
  }), [anomalies]);

  const hasAnyPeriodData = daily.length > 0 || weekly.length > 0 || monthly.length > 0;
  if (!hasAnyPeriodData) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[#3d3335] flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#9c6b3f]" /> Trends &amp; breakdowns
        </h2>
        <Segmented
          value={granularity}
          onChange={setGranularity}
          options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Revenue & transactions" subtitle={`${granularity[0].toUpperCase()}${granularity.slice(1)} totals over the analysed window`} icon={<LineChartIcon className="w-4 h-4" />} tall>
          {series.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey={periodLabel} stroke={SLATE_FAINT} fontSize={9} tickLine={false} />
                <YAxis yAxisId="left" stroke={SLATE_FAINT} fontSize={9} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke={SLATE_FAINT} fontSize={9} tickLine={false} />
                <Tooltip content={<ChartTooltip line={(r) => r.name === "Revenue" ? `Revenue: ${formatMoney(r.value)}` : `Transactions: ${r.value}`} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar yAxisId="right" dataKey="transactions" name="Transactions" fill={PEBBLE} radius={[3, 3, 0, 0]} opacity={0.55} />
                <Line yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke={PEANUT} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <Empty label="No data for this granularity yet." />}
        </Panel>

        <Panel title="Cumulative revenue" subtitle="Running total across the whole analysed period" icon={<TrendingUp className="w-4 h-4" />} tall>
          {cumulative.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulative} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cumulative-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PEANUT} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={PEANUT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="date" stroke={SLATE_FAINT} fontSize={9} tickLine={false} minTickGap={30} />
                <YAxis stroke={SLATE_FAINT} fontSize={9} tickLine={false} />
                <Tooltip content={<ChartTooltip line={(r) => `Total: ${formatMoney(r.value)}`} />} />
                <Area type="monotone" dataKey="total" name="Total revenue" stroke={PEANUT} strokeWidth={2} fill="url(#cumulative-grad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty label="No daily data yet." />}
        </Panel>

        <Panel title="Growth rate" subtitle={`Period-over-period % change (${granularity})`} icon={<TrendingUp className="w-4 h-4" />}>
          {growthSeries.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growthSeries} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey={periodLabel} stroke={SLATE_FAINT} fontSize={9} tickLine={false} />
                <YAxis stroke={SLATE_FAINT} fontSize={9} tickLine={false} unit="%" domain={[-GROWTH_CAP, GROWTH_CAP]} />
                <ReferenceLine y={0} stroke={SLATE_FAINT} />
                <Tooltip content={<ChartTooltip line={(r) => {
                  const actual = r.payload.growth_pct as number;
                  const capped = Math.abs(actual) > GROWTH_CAP ? " (capped for display)" : "";
                  return `${actual > 0 ? "+" : ""}${actual.toFixed(1)}%${capped}`;
                }} />} />
                <Bar dataKey="growth_display" name="Growth" radius={[3, 3, 3, 3]}>
                  {growthSeries.map((p, i) => <Cell key={i} fill={p.growth_display < 0 ? ROSE : GREEN} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty label="Need at least two periods to show growth." />}
        </Panel>

        <Panel title="Sales by day of week" subtitle="Average revenue per weekday across the whole window" icon={<CalendarDays className="w-4 h-4" />}>
          {byWeekday.some(b => b.avgRevenue > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byWeekday} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="name" stroke={SLATE_FAINT} fontSize={9} tickLine={false} />
                <YAxis stroke={SLATE_FAINT} fontSize={9} tickLine={false} />
                <Tooltip content={<ChartTooltip line={(r) => `Avg. revenue: ${formatMoney(r.value)}`} />} />
                <Bar dataKey="avgRevenue" name="Avg. revenue" fill={PEANUT} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty label="No daily data yet." />}
        </Panel>

        <Panel title="Revenue share by category" subtitle={`All ${allCategories.length} categories`} icon={<PieIcon className="w-4 h-4" />}>
          {allCategories.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip line={(r) => `${String(r.payload.category)}: ${formatMoney(r.value)}`} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Pie data={allCategories} dataKey="revenue" nameKey="category" innerRadius={45} outerRadius={68} paddingAngle={2}>
                  {allCategories.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty label="No category column recognised in this data." />}
        </Panel>

        <Panel title="Revenue by category" subtitle="Ranked, highest first" icon={<PieIcon className="w-4 h-4" />}>
          {allCategories.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allCategories} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal={false} />
                <XAxis type="number" stroke={SLATE_FAINT} fontSize={9} tickLine={false} />
                <YAxis type="category" dataKey="category" stroke={SLATE_FAINT} fontSize={9} tickLine={false} width={80} />
                <Tooltip content={<ChartTooltip line={(r) => `${formatMoney(r.value)} · ${String(r.payload.volume)} orders`} />} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {allCategories.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty label="No category column recognised in this data." />}
        </Panel>

        {paymentBreakdown.length > 0 && (
          <Panel title="Payment methods" subtitle="Share of revenue by how customers paid" icon={<CreditCard className="w-4 h-4" />}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip line={(r) => `${String(r.payload.method)}: ${formatMoney(r.value)}`} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Pie data={paymentBreakdown} dataKey="revenue" nameKey="method" innerRadius={45} outerRadius={68} paddingAngle={2}>
                  {paymentBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {quantityBreakdown.length > 1 && (
          <Panel title="Average sale by order size" subtitle="Average amount for orders of each quantity" icon={<Package className="w-4 h-4" />}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={quantityBreakdown} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="quantity" stroke={SLATE_FAINT} fontSize={9} tickLine={false} tickFormatter={(v) => `Qty ${v}`} />
                <YAxis stroke={SLATE_FAINT} fontSize={9} tickLine={false} />
                <Tooltip content={<ChartTooltip line={(r) => `${formatMoney(r.value)} avg · ${String(r.payload.count)} orders`} />} />
                <Bar dataKey="avg_amount" fill={WOOL_DK} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {amountDistribution.length > 0 && (
          <Panel title="Transaction size distribution" subtitle="How many orders fall in each amount range" icon={<PieIcon className="w-4 h-4" />}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={amountDistribution} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="range" stroke={SLATE_FAINT} fontSize={8} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis stroke={SLATE_FAINT} fontSize={9} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip line={(r) => `${String(r.payload.range)}: ${r.value} orders`} />} />
                <Bar dataKey="count" name="Orders" radius={[3, 3, 0, 0]}>
                  {amountDistribution.map((d, i) => <Cell key={i} fill={d.range.startsWith("Refunds") ? ROSE : PEANUT} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {anomalies.length > 0 && (
          <Panel title="Anomalies over time" subtitle="Flagged outliers and refunds by date" icon={<TrendingUp className="w-4 h-4" />}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="date" type="category" stroke={SLATE_FAINT} fontSize={8} tickLine={false} allowDuplicatedCategory={false} />
                <YAxis dataKey="amount" type="number" stroke={SLATE_FAINT} fontSize={9} tickLine={false} />
                <ReferenceLine y={0} stroke={SLATE_FAINT} />
                <Tooltip content={<ChartTooltip line={(r) => `${formatMoney(r.value)} — ${String(r.payload.reason)}`} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Scatter name="High-value outliers" data={anomalyPoints.outliers} fill={WOOL_DK} />
                <Scatter name="Refunds" data={anomalyPoints.refunds} fill={ROSE} />
              </ScatterChart>
            </ResponsiveContainer>
          </Panel>
        )}
      </div>

      {typeof correlation === "number" && (
        <div className="glass-card p-4 flex items-center gap-3 text-xs text-[#6d6062] flex-wrap">
          <span className="font-bold text-[#3d3335]">Amount vs. quantity correlation:</span>
          <span className={correlation > 0 ? "text-[#5f7a58] font-semibold" : "text-[#b0564f] font-semibold"}>{correlation.toFixed(2)}</span>
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
