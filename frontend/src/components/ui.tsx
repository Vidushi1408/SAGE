import React from "react";

export const inputClass =
  "w-full px-4 py-2.5 rounded-lg bg-white border border-[#d9cdb8] text-[#3d3335] text-xs placeholder-[#a89b93] focus:outline-none focus:ring-2 focus:ring-[#ead9c2] focus:border-[#b9855a] transition-all";
export const labelClass = "block text-[10px] font-bold text-[#8a7d78] uppercase tracking-widest mb-1.5";
export const primaryButton =
  "px-4 py-2.5 rounded-lg bg-[#9c6b3f] hover:bg-[#7f5631] disabled:bg-[#cca87c] disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2";
export const secondaryButton =
  "px-4 py-2.5 rounded-lg glass-card hover:bg-[#f6f1e7] text-[#5c5052] text-xs font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50";

export function formatMoney(value: number | undefined | null): string {
  return `$${(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Backend timestamps are naive UTC strings; parse them as UTC so local display is correct. */
export function parseServerDate(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
}

export function formatDateTime(iso: string): string {
  return parseServerDate(iso).toLocaleString();
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const date = parseServerDate(iso);
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-[#3d3335] tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[#8a7d78] mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[#e6ddc9]/70 ${className}`} aria-hidden="true" />;
}

export function EmptyState({
  icon, title, body, action
}: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="glass-card p-10 text-center flex flex-col items-center gap-3">
      <div className="p-3 rounded-xl bg-[#f2e9dc] border border-[#ead9c2] text-[#9c6b3f]">{icon}</div>
      <h3 className="text-base font-bold text-[#3d3335]">{title}</h3>
      <p className="text-xs text-[#8a7d78] max-w-md leading-relaxed">{body}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "warning"; children: React.ReactNode }) {
  const styles = {
    error: "bg-red-50 border-red-200 text-red-700",
    success: "bg-emerald-50 border-emerald-200 text-emerald-700",
    warning: "bg-amber-50 border-amber-200 text-amber-800"
  }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={`p-4 rounded-xl border text-xs ${styles}`}>{children}</div>;
}
