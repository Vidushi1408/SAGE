"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, Clock, Download, Lightbulb, Search, Sparkles } from "lucide-react";
import { useWorkspace } from "../../../components/workspace/WorkspaceProvider";
import InsightChart from "../../../components/InsightChart";
import AnalyticsCharts from "../../../components/AnalyticsCharts";
import { EmptyState, PageHeader, formatDateTime, formatMoney, inputClass, secondaryButton, timeAgo } from "../../../components/ui";

type Anomaly = { transaction_id: string; date: string; amount: number; reason: string; z_score: number };

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    // Quote fields containing separators; also neutralise spreadsheet formula injection.
    const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const blob = new Blob([rows.map(r => r.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InsightsPage() {
  const { insights, profile, insightHistory, selectedInsightId, selectInsight, hasData } = useWorkspace();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"amount" | "date">("amount");

  const anomalies: Anomaly[] = useMemo(() => profile?.anomalies ?? [], [profile]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? anomalies.filter(a => `${a.transaction_id} ${a.date} ${a.reason}`.toLowerCase().includes(q))
      : anomalies;
    return [...filtered].sort((a, b) => sortBy === "amount" ? Math.abs(b.amount) - Math.abs(a.amount) : b.date.localeCompare(a.date));
  }, [anomalies, query, sortBy]);

  if (!hasData && !insights && insightHistory.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Insights" subtitle="Everything SAGE has learned about your business, with a history you can revisit." />
        <EmptyState icon={<Lightbulb className="w-5 h-5" />} title="No insights yet" body="Add your data on the Data page, then hit Refresh. Each analysis is saved here so you can compare how things change." />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Insights"
        subtitle="Everything SAGE has learned about your business, with a history you can revisit."
        actions={
          <button
            className={secondaryButton}
            disabled={visible.length === 0}
            onClick={() => downloadCsv("sage-anomalies.csv", [
              ["Date", "Transaction ID", "Amount", "Z-Score", "Reason"],
              ...visible.map(a => [a.date, a.transaction_id, a.amount, a.z_score, a.reason])
            ])}
          >
            <Download className="w-3.5 h-3.5" /> Export anomalies (CSV)
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6 items-start">
        <aside className="glass-card p-4 space-y-2 lg:sticky lg:top-20">
          <h2 className="text-xs font-bold text-[#3d3335] flex items-center gap-2 px-2 pb-2"><Clock className="w-3.5 h-3.5 text-[#8a7d78]" /> Analysis history</h2>
          <button
            onClick={() => selectInsight("latest")}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all border ${selectedInsightId === "latest" ? "bg-[#f2e9dc] border-[#ddc2a0] text-[#7f5631]" : "border-transparent text-[#8a7d78] hover:bg-[#efe8d8]"}`}
          >
            <span className="font-semibold">Latest</span>
          </button>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {insightHistory.map(h => (
              <button
                key={h.id}
                onClick={() => selectInsight(h.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all border ${selectedInsightId === h.id ? "bg-[#f2e9dc] border-[#ddc2a0]" : "border-transparent hover:bg-[#efe8d8]"}`}
              >
                <span className="block font-semibold text-[#5c5052]">{timeAgo(h.created_at)}</span>
                <span className="block text-[10px] text-[#8a7d78]">{formatDateTime(h.created_at)}</span>
                {h.recommendation && <span className="block text-[11px] text-[#8a7d78] mt-1 line-clamp-2">{h.recommendation}</span>}
              </button>
            ))}
            {insightHistory.length === 0 && <p className="text-[11px] text-[#6d6062] px-3 py-2">Snapshots will appear after your first analysis.</p>}
          </div>
        </aside>

        <div className="space-y-8 min-w-0">
          {insights?.recommendation && (
            <div className="p-5 rounded-2xl bg-[#f2e9dc] border border-[#ead9c2] flex gap-3 items-start">
              <Sparkles className="w-5 h-5 text-[#9c6b3f] shrink-0 mt-0.5" />
              <p className="text-[#6d6062] text-xs leading-relaxed font-medium">{insights.recommendation}</p>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {insights?.insights?.map((insight, idx) => (
              <div key={idx} className="glass-card p-6 flex flex-col gap-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-[#3d3335] text-sm">{insight.title}</h3>
                  <p className="text-xs text-[#8a7d78] leading-relaxed">{insight.explanation}</p>
                </div>
                <InsightChart insight={insight} idx={idx} />
              </div>
            ))}
          </div>

          <AnalyticsCharts profile={profile} />

          <section className="glass-card p-6" aria-labelledby="anomalies-heading">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-[#efe8d8] pb-3">
              <h2 id="anomalies-heading" className="font-bold text-[#3d3335] text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" /> Outliers &amp; anomalies
                <span className="text-[10px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-600 px-2 py-0.5 rounded-full">{anomalies.length}</span>
              </h2>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7d78]" />
                  <input aria-label="Search anomalies" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" className={`${inputClass} pl-9 !py-2 w-40`} />
                </div>
                <select aria-label="Sort anomalies" value={sortBy} onChange={e => setSortBy(e.target.value as "amount" | "date")} className={`${inputClass} !py-2 w-auto`}>
                  <option value="amount">Largest first</option>
                  <option value="date">Newest first</option>
                </select>
              </div>
            </div>

            {visible.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#8a7d78]">
                  <thead>
                    <tr className="border-b border-[#efe8d8] text-[#8a7d78] font-semibold">
                      <th className="py-2.5">Date</th><th className="py-2.5">Transaction</th><th className="py-2.5">Amount</th>
                      <th className="py-2.5">Z-score</th><th className="py-2.5 text-right">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#efe8d8]">
                    {visible.map((a, i) => (
                      <tr key={i} className="hover:bg-[#f6f1e7]">
                        <td className="py-3 font-medium text-[#3d3335]">{a.date}</td>
                        <td className="py-3 font-mono">{a.transaction_id}</td>
                        <td className={`py-3 font-bold ${a.amount < 0 ? "text-rose-600" : "text-amber-600"}`}>{formatMoney(a.amount)}</td>
                        <td className="py-3">{a.z_score !== 0 ? a.z_score.toFixed(2) : "n/a"}</td>
                        <td className="py-3 text-right text-[#6d6062]">{a.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-[#8a7d78] py-6 text-center">{anomalies.length ? "No anomalies match your search." : "No anomalies found. Operations are within tolerance."}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
