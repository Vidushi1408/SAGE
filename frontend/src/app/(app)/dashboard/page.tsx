"use client";

import React from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, Circle, DollarSign, HelpCircle, RefreshCw, Sparkles,
  TrendingDown, TrendingUp, Trophy
} from "lucide-react";
import { useWorkspace } from "../../../components/workspace/WorkspaceProvider";
import { isComplete, latestComparableGrowth, periodInProgress, type PeriodPoint } from "../../../lib/periods";
import KpiCard from "../../../components/KpiCard";
import InsightChart from "../../../components/InsightChart";
import { Alert, EmptyState, PageHeader, formatDateTime, formatMoney, primaryButton, timeAgo } from "../../../components/ui";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function GettingStarted() {
  const { sheets, hasData, insights, team, isAdmin, canWrite, refreshAnalysis, refreshing } = useWorkspace();
  const connected = sheets.length > 0 || hasData;
  const steps = [
    { done: connected, title: "Connect your data", body: "Link Google Sheets or upload a CSV/XLSX export.", href: "/data", cta: "Add data" },
    { done: !!insights, title: "Run your first analysis", body: "SAGE profiles your numbers and writes plain-English insights.", cta: "Run analysis", action: true },
    { done: team.length > 1, title: "Invite your team", body: "Share the same insights with teammates, with the right access.", href: "/team", cta: "Invite", hidden: !isAdmin }
  ].filter(s => !s.hidden);

  return (
    <div className="glass-card p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-[#3d3335] flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#9c6b3f]" /> Get started with SAGE</h2>
        <p className="text-xs text-[#8a7d78] mt-1">Three quick steps and your dashboard fills itself in.</p>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <li key={s.title} className={`p-4 rounded-xl border ${s.done ? "border-emerald-200 bg-emerald-50" : "border-[#e6ddc9] bg-[#f6f1e7]"} flex flex-col gap-3`}>
            <div className="flex items-center gap-2 text-xs font-bold text-[#3d3335]">
              {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-[#6d6062]" />}
              {i + 1}. {s.title}
            </div>
            <p className="text-xs text-[#8a7d78] leading-relaxed flex-1">{s.body}</p>
            {!s.done && canWrite && (s.action ? (
              <button onClick={refreshAnalysis} disabled={refreshing || !connected} className={primaryButton}>
                {refreshing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}{s.cta}
              </button>
            ) : (
              <Link href={s.href!} className={primaryButton}>{s.cta} <ArrowRight className="w-3.5 h-3.5" /></Link>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function OverviewPage() {
  const { user, profile, insights, hasData, lastAnalysedAt, selectedInsightId, insightHistory, selectInsight } = useWorkspace();

  const summary = profile?.summary ?? { total_revenue: 0, total_transactions: 0, avg_transaction_value: 0 };
  const anomalies: { transaction_id: string; date: string; amount: number; reason: string; z_score: number }[] = profile?.anomalies ?? [];
  const weekly: PeriodPoint[] = profile?.period_metrics?.weekly ?? [];
  const finished = weekly.filter(isComplete);
  const comparable = latestComparableGrowth(weekly);
  const growth: number | null | undefined = comparable?.growth_pct;
  const weekInProgress = periodInProgress(weekly);
  const topCategory = profile?.category_metrics?.top_categories?.[0];
  const warnings: string[] = profile?.data_quality?.warnings ?? [];
  const name = user?.name || user?.email.split("@")[0];
  const viewingHistory = selectedInsightId !== "latest";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${greeting()}, ${name}`}
        subtitle={lastAnalysedAt ? `Here's how your business is doing. Last analysed ${timeAgo(lastAnalysedAt)}.` : "Welcome to your SAGE workspace."}
        actions={insightHistory.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-[#8a7d78]">
            Snapshot
            <select
              value={selectedInsightId}
              onChange={(e) => selectInsight(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#e6ddc9] text-[#3d3335] text-xs focus:outline-none focus:border-[#b9855a]"
            >
              <option value="latest">Latest</option>
              {insightHistory.map(h => <option key={h.id} value={h.id}>{formatDateTime(h.created_at)}</option>)}
            </select>
          </label>
        )}
      />

      {viewingHistory && (
        <Alert tone="warning">You&apos;re viewing an older snapshot. <button className="underline font-semibold" onClick={() => selectInsight("latest")}>Back to latest</button></Alert>
      )}

      {!hasData && !insights && <GettingStarted />}

      {warnings.length > 0 && (
        <Alert tone="warning">
          <p className="font-bold flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4" /> Some of your data may not be read correctly</p>
          {warnings.map((w, i) => <p key={i} className="text-amber-700">{w}</p>)}
        </Alert>
      )}

      {insights?.recommendation && (
        <div className="p-5 rounded-2xl bg-[#f2e9dc] border border-[#ead9c2] flex gap-3 items-start">
          <Sparkles className="w-5 h-5 text-[#9c6b3f] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-[#3d3335] text-sm">Recommended next step</h2>
            <p className="text-[#6d6062] text-xs mt-0.5 leading-relaxed font-medium">{insights.recommendation}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard index={0} label="Total Sales" value={summary.total_revenue} format={formatMoney} hint="Gross sales in the analysed window" icon={<DollarSign className="w-4 h-4" />} tone="bg-[#f2e9dc] text-[#9c6b3f]" trend={finished.map(w => w.revenue)} trendLabel="Weekly sales, finished weeks" />
        <KpiCard index={1} label="Transactions" value={summary.total_transactions} format={n => Math.round(n).toLocaleString()} hint="Entries processed" icon={<Activity className="w-4 h-4" />} tone="bg-[#f2e9dc] text-[#7d6864]" trend={finished.map(w => w.transactions)} trendLabel="Weekly transactions, finished weeks" />
        <KpiCard index={2} label="Average Sale" value={summary.avg_transaction_value} format={formatMoney} hint="Average ticket value" icon={<HelpCircle className="w-4 h-4" />} tone="bg-[#efe6d3] text-[#a08a5c]" trend={finished.filter(w => w.transactions > 0).map(w => w.revenue / w.transactions)} trendLabel="Weekly average sale, finished weeks" />
        <KpiCard
          index={3}
          label="Weekly Growth"
          value={growth ?? null}
          format={n => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`}
          text="n/a"
          trend={finished.map(w => w.growth_pct).filter((g): g is number => g !== null && g !== undefined)}
          trendLabel="Weekly growth, finished weeks"
          hint={comparable
            ? `Week of ${(comparable.week ?? "").split("/")[0]} vs the week before${weekInProgress ? " · this week is still in progress" : ""}`
            : weekInProgress ? "Not enough full weeks to compare yet" : "Latest week vs the week before"}
          icon={growth !== null && growth !== undefined && growth < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
          tone={growth !== null && growth !== undefined && growth < 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}
        />
      </div>

      {topCategory && (
        <div className="glass-card p-4 flex items-center gap-3 text-xs">
          <Trophy className="w-4 h-4 text-amber-600" />
          <span className="text-[#8a7d78]">Top category:</span>
          <span className="font-bold text-[#3d3335]">{topCategory.category}</span>
          <span className="text-[#8a7d78]">{formatMoney(topCategory.revenue)} · {topCategory.share_pct.toFixed(1)}% of sales</span>
        </div>
      )}

      {insights?.insights?.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {insights.insights.map((insight, idx) => (
            <div key={idx} className="glass-card sage-reveal p-6 flex flex-col justify-between gap-4" style={{ "--i": idx + 4 } as React.CSSProperties}>
              <div className="space-y-1">
                <h3 className="font-bold text-[#3d3335] text-sm flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#b9855a]" />
                  {insight.title}
                </h3>
                <p className="text-xs text-[#8a7d78] leading-relaxed">{insight.explanation}</p>
              </div>
              <InsightChart insight={insight} idx={idx} />
            </div>
          ))}
        </div>
      ) : hasData ? (
        <EmptyState icon={<Sparkles className="w-5 h-5" />} title="No insights yet" body="Your data is in. Use Refresh in the header to generate your first insights." />
      ) : null}

      {anomalies.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4 border-b border-[#efe8d8] pb-3">
            <h2 className="font-bold text-[#3d3335] text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-600" /> Needs your attention</h2>
            <Link href="/insights" className="text-xs font-semibold text-[#9c6b3f] hover:text-[#3d3335] flex items-center gap-1">All {anomalies.length} <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <ul className="divide-y divide-[#efe8d8]">
            {anomalies.slice(0, 3).map((a, i) => (
              <li key={i} className="py-3 flex items-center justify-between gap-3 text-xs">
                <span className="text-[#6d6062]"><span className="font-mono text-[#8a7d78] mr-2">{a.transaction_id}</span>{a.date}</span>
                <span className="flex items-center gap-3">
                  <span className="text-[#8a7d78] hidden sm:inline">{a.reason}</span>
                  <span className={`font-bold ${a.amount < 0 ? "text-rose-600" : "text-amber-600"}`}>{formatMoney(a.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
