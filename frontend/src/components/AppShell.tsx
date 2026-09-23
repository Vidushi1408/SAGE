"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle, Bell, CheckCircle2, ChevronDown, Database, LayoutDashboard, LogOut, Menu, MessageCircle,
  RefreshCw, Settings as SettingsIcon, Sparkles, Users, X, Lightbulb
} from "lucide-react";
import { useWorkspace } from "./workspace/WorkspaceProvider";
import ChatPanel from "./ChatPanel";
import { Alert, formatMoney, timeAgo } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/data", label: "Data", icon: Database },
  { href: "/ask", label: "Ask SAGE", icon: MessageCircle },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: SettingsIcon }
];

/** Close a dropdown when the user clicks outside it or presses Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function NotificationBell() {
  const { profile } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const anomalies: { transaction_id: string; date: string; amount: number; reason: string }[] = profile?.anomalies ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={`Notifications${anomalies.length ? `, ${anomalies.length} flagged` : ""}`}
        aria-expanded={open}
        className="relative p-2 rounded-lg text-[#8a7d78] hover:text-[#3d3335] hover:bg-[#efe8d8] transition-all"
      >
        <Bell className="w-4 h-4" />
        {anomalies.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center">
            {anomalies.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[85vw] glass-card p-0 shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#efe8d8] flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#3d3335]">Alerts</h3>
            <span className="text-[10px] text-[#8a7d78]">{anomalies.length} flagged</span>
          </div>
          {anomalies.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#8a7d78] flex flex-col items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Nothing unusual. Operations are within tolerance.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-[#efe8d8]">
              {anomalies.slice(0, 6).map((a, i) => (
                <li key={i} className="px-4 py-3 flex gap-3 items-start">
                  <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-[#3d3335] font-semibold">
                      <span className={a.amount < 0 ? "text-rose-600" : "text-amber-600"}>{formatMoney(a.amount)}</span> on {a.date}
                    </p>
                    <p className="text-[10px] text-[#8a7d78] truncate">{a.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/insights"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 border-t border-[#efe8d8] text-center text-xs font-semibold text-[#9c6b3f] hover:text-[#7f5631] hover:bg-[#f6f1e7]"
          >
            View all in Insights
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, signOut } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const display = user?.name || user?.email.split("@")[0] || "Account";
  const initial = display.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-[#efe8d8] transition-all"
      >
        <span className="w-7 h-7 rounded-full bg-[#9c6b3f] text-white text-xs font-bold flex items-center justify-center">
          {initial}
        </span>
        <ChevronDown className="w-3 h-3 text-[#8a7d78] hidden sm:block" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 glass-card p-0 shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#efe8d8]">
            <p className="text-xs font-bold text-[#3d3335] truncate">{display}</p>
            <p className="text-[10px] text-[#8a7d78] truncate">{user?.email}</p>
            <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize bg-[#f2e9dc] border border-[#ead9c2] text-[#7f5631]">
              {user?.role}
            </span>
          </div>
          <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-xs text-[#6d6062] hover:text-[#3d3335] hover:bg-[#f6f1e7]">
            <SettingsIcon className="w-3.5 h-3.5" /> Account settings
          </Link>
          <Link href="/team" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-xs text-[#6d6062] hover:text-[#3d3335] hover:bg-[#f6f1e7]">
            <Users className="w-3.5 h-3.5" /> Team
          </Link>
          <button onClick={signOut} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-rose-600 hover:bg-rose-50 border-t border-[#efe8d8]">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { canWrite, refreshing, refreshStep, refreshAnalysis, lastAnalysedAt, error, setError, toast, loading } = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-screen bg-[#f6f1e7] text-[#5c5052] flex flex-col relative">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:px-3 focus:py-2 focus:bg-[#9c6b3f] focus:text-white focus:rounded-lg text-xs">
        Skip to content
      </a>

      <header className="border-b border-[#e6ddc9] bg-white/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            className="lg:hidden p-2 -ml-2 text-[#8a7d78] hover:text-[#3d3335]"
            onClick={() => setMobileOpen(o => !o)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <span className="w-7 h-7 rounded-lg bg-[#9c6b3f] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </span>
            <span className="text-lg font-bold text-[#3d3335] tracking-tight">SAGE</span>
          </Link>

          <nav aria-label="Main" className="hidden lg:flex items-center gap-1 ml-4">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive(href) ? "bg-[#f2e9dc] text-[#7f5631]" : "text-[#8a7d78] hover:text-[#3d3335] hover:bg-[#efe8d8]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            {canWrite && (
              <button
                onClick={refreshAnalysis}
                disabled={refreshing}
                className="px-3 py-1.5 text-xs rounded-lg glass-card hover:bg-[#f6f1e7] text-[#5c5052] font-medium flex items-center gap-2 disabled:opacity-70"
                title="Sync your data and re-run the analysis"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#9c6b3f]" : ""}`} />
                <span className="hidden sm:inline">{refreshing ? refreshStep || "Working..." : "Refresh"}</span>
              </button>
            )}
            {!refreshing && lastAnalysedAt && (
              <span className="hidden md:inline text-[10px] text-[#8a7d78]">Updated {timeAgo(lastAnalysedAt)}</span>
            )}
            <NotificationBell />
            <UserMenu />
          </div>
        </div>

        {mobileOpen && (
          <nav aria-label="Mobile" className="lg:hidden border-t border-[#e6ddc9] px-4 py-3 grid grid-cols-2 gap-2">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive(href) ? "page" : undefined}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold ${
                  isActive(href) ? "bg-[#f2e9dc] text-[#7f5631]" : "text-[#8a7d78] hover:bg-[#efe8d8]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main id="main" className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 relative z-10">
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-emerald-600 text-white text-xs flex items-center gap-2 shadow-lg" role="status">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {toast}
          </div>
        )}
        {error && (
          <Alert tone="error">
            <div className="flex items-start justify-between gap-3">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss" className="text-red-500 hover:text-red-700 shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          </Alert>
        )}
        {loading ? <PageSkeleton /> : children}
      </main>

      <footer className="border-t border-[#e6ddc9] py-5 text-center text-[11px] text-[#8a7d78]">
        SAGE · An analyst that never clocks out ·{" "}
        <Link href="/privacy" className="hover:text-[#6d6062]">Privacy</Link> ·{" "}
        <Link href="/terms" className="hover:text-[#6d6062]">Terms</Link>
      </footer>

      {pathname !== "/ask" && <ChatPanel />}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading workspace">
      <div className="h-8 w-56 rounded-lg bg-[#e6ddc9]/70 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl bg-[#e6ddc9]/70 animate-pulse" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map(i => <div key={i} className="h-72 rounded-2xl bg-[#e6ddc9]/70 animate-pulse" />)}
      </div>
    </div>
  );
}
