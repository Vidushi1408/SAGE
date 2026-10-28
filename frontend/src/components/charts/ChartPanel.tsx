"use client";

import React, { useState } from "react";
import { INK } from "../../lib/chartTheme";

export interface TableColumn { key: string; label: string; align?: "right"; format?: (value: unknown, row: Record<string, unknown>) => string }
export interface TableSpec { columns: TableColumn[]; rows: Record<string, unknown>[] }

/** The table twin of a chart: every value on the chart is readable here without hovering. */
export function DataTable({ table, caption }: { table: TableSpec; caption: string }) {
  return (
    <div className="h-full overflow-auto rounded-lg border border-[#efe8d8]">
      <table className="w-full text-left text-[11px]" style={{ color: INK.secondary }}>
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-[#faf6ec]">
          <tr>{table.columns.map(c => (
            <th key={c.key} scope="col" className={`px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : ""}`} style={{ color: INK.primary }}>{c.label}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-[#efe8d8]">
          {table.rows.map((row, i) => (
            <tr key={i}>{table.columns.map(c => (
              <td key={c.key} className={`px-3 py-1.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                {c.format ? c.format(row[c.key], row) : String(row[c.key] ?? "")}
              </td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Card around one chart: title, optional icon, a Chart/Table switch, and an accessible text summary.
 * `index` staggers the entrance animation when several panels mount together.
 */
export function ChartPanel({
  title, subtitle, icon, children, table, summary, height = "h-56", index = 0, legend
}: {
  title: string; subtitle?: string; icon: React.ReactNode; children: React.ReactNode;
  table?: TableSpec; summary?: string; height?: string; index?: number; legend?: React.ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className="glass-card sage-reveal p-6 flex flex-col gap-3" style={{ ["--i" as string]: index }} aria-label={title}>
      <div className="flex items-start gap-2.5">
        <div className="p-1.5 rounded-lg bg-[#f2e9dc] text-[#9c6b3f] shrink-0 mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-[#3d3335]">{title}</h3>
          {subtitle && <p className="text-[11px] text-[#8a7d78] mt-0.5">{subtitle}</p>}
        </div>
        {table && (
          <div className="inline-flex rounded-md border border-[#e6ddc9] bg-white p-0.5 text-[10px] font-semibold shrink-0" role="group" aria-label={`${title} view`}>
            {(["chart", "table"] as const).map(v => (
              <button
                key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                className={`px-2 py-1 rounded transition-colors capitalize ${view === v ? "bg-[#9c6b3f] text-white" : "text-[#6d6062] hover:bg-[#f2e9dc]"}`}
              >{v}</button>
            ))}
          </div>
        )}
      </div>
      <div className={height}>
        {view === "table" && table
          ? <DataTable table={table} caption={`${title}${subtitle ? `: ${subtitle}` : ""}`} />
          : <div className="h-full" role="img" aria-label={summary ?? `${title}${subtitle ? `. ${subtitle}` : ""}`}>{children}</div>}
      </div>
      {legend && view === "chart" && <div>{legend}</div>}
    </section>
  );
}

export function EmptyChart({ label }: { label: string }) {
  return <div className="h-full flex items-center justify-center text-xs text-[#a89b93] text-center px-6">{label}</div>;
}
