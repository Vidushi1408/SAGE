"use client";

import React from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, Circle, DollarSign, HelpCircle, RefreshCw, Sparkles,
  TrendingDown, TrendingUp, Trophy
} from "lucide-react";
import { useWorkspace } from "../../../components/workspace/WorkspaceProvider";
import InsightChart from "../../../components/InsightChart";
import { Alert, EmptyState, PageHeader, formatDateTime, formatMoney, primaryButton, timeAgo } from "../../../components/ui";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Kpi({ label, value, hint, icon, tone }: { label: string; value: string; hint: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="glass-card p-6 flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</span>
        <div className={`p-2 rounded-lg ${tone}`}>{icon}</div>
      </div>
      <div>
        <div className="text-2xl font-extrabold text-white">{value}</div>
        <div className="text-[10px] text-gray-500 mt-1">{hint}</div>
      </div>
    </div>
  );
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
        <h2 className="text-base font-bold text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-400" /> Get started with SAGE</h2>
        <p className="text-xs text-gray-500 mt-1">Three quick steps and your dashboard fills itself in.</p>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <li key={s.title} className={`p-4 rounded-xl border ${s.done ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/10 bg-black/20"} flex flex-col gap-3`}>
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-gray-600" />}
              {i + 1}. {s.title}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed flex-1">{s.body}</p>
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
  const weekly = profile?.period_metrics?.weekly ?? [];
  const growth: number | null | undefined = weekly[weekly.length - 1]?.growth_pct;
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
          <label className="flex items-center gap-2 text-xs text-gray-500">
            Snapshot
            <select
              value={selectedInsightId}
              onChange={(e) => selectInsight(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500"
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
          {warnings.map((w, i) => <p key={i} className="text-amber-200/80">{w}</p>)}
        </Alert>
      )}

      {insights?.recommendation && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/20 flex gap-3 items-start shadow-lg shadow-indigo-500/5">
          <Sparkles className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-white text-sm">Recommended next step</h2>
            <p className="text-gray-300 text-xs mt-0.5 leading-relaxed font-medium">{insights.recommendation}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Sales" value={formatMoney(summary.total_revenue)} hint="Gross sales in the analysed window" icon={<DollarSign className="w-4 h-4" />} tone="bg-indigo-500/10 text-indigo-400" />
        <Kpi label="Transactions" value={String(summary.total_transactions)} hint="Entries processed" icon={<Activity className="w-4 h-4" />} tone="bg-purple-500/10 text-purple-400" />
        <Kpi label="Average Sale" value={formatMoney(summary.avg_transaction_value)} hint="Average ticket value" icon={<HelpCircle className="w-4 h-4" />} tone="bg-pink-500/10 text-pink-400" />
        <Kpi
          label="Weekly Growth"
          value={growth !== null && growth !== undefined ? `${growth > 0 ? "+" : ""}${growth.toFixed(1)}%` : "n/a"}
          hint="Latest week vs the week before"
          icon={growth !== null && growth !== undefined && growth < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
          tone={growth !== null && growth !== undefined && growth < 0 ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"}
        />
      </div>

      {topCategory && (
        <div className="glass-card p-4 flex items-center gap-3 text-xs">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-gray-400">Top category:</span>
          <span className="font-bold text-white">{topCategory.category}</span>
          <span className="text-gray-500">{formatMoney(topCategory.revenue)} · {topCategory.share_pct.toFixed(1)}% of sales</span>
        </div>
      )}

      {insights?.insights?.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {insights.insights.map((insight, idx) => (
            <div key={idx} className="glass-card p-6 flex flex-col justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-extrabold text-white text-sm flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  {insight.title}
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed">{insight.explanation}</p>
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
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
            <h2 className="font-extrabold text-white text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-400" /> Needs your attention</h2>
            <Link href="/insights" className="text-xs font-semibold text-indigo-300 hover:text-white flex items-center gap-1">All {anomalies.length} <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <ul className="divide-y divide-white/5">
            {anomalies.slice(0, 3).map((a, i) => (
              <li key={i} className="py-3 flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-300"><span className="font-mono text-gray-500 mr-2">{a.transaction_id}</span>{a.date}</span>
                <span className="flex items-center gap-3">
                  <span className="text-gray-500 hidden sm:inline">{a.reason}</span>
                  <span className={`font-bold ${a.amount < 0 ? "text-rose-400" : "text-amber-400"}`}>{formatMoney(a.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
