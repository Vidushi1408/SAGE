import React from "react";

export const inputClass =
  "w-full px-4 py-2.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-all";
export const labelClass = "block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5";
export const primaryButton =
  "px-4 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all shadow-md shadow-indigo-500/20 inline-flex items-center justify-center gap-2";
export const secondaryButton =
  "px-4 py-2.5 rounded-lg glass-card hover:bg-white/10 text-white text-xs font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50";

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
        <h1 className="text-2xl font-extrabold text-white tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} aria-hidden="true" />;
}

export function EmptyState({
  icon, title, body, action
}: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="glass-card p-10 text-center flex flex-col items-center gap-3">
      <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">{icon}</div>
      <h3 className="text-base font-bold text-white">{title}</h3>
      <p className="text-xs text-gray-500 max-w-md leading-relaxed">{body}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "warning"; children: React.ReactNode }) {
  const styles = {
    error: "bg-red-500/10 border-red-500/20 text-red-200",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-200",
    warning: "bg-amber-500/10 border-amber-500/20 text-amber-200"
  }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={`p-4 rounded-xl border text-xs ${styles}`}>{children}</div>;
}
