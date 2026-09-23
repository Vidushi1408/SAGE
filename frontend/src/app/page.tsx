"use client";

import React from "react";
import Link from "next/link";
import { MarketingFooter, MarketingHeader } from "../components/marketing/MarketingChrome";
import { 
  Sparkles, Database, ShieldAlert, ArrowRight, BarChart3, LineChart, Users, CheckCircle2, ChevronRight 
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f6f1e7] text-[#5c5052] relative overflow-hidden flex flex-col justify-between">
      

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none"></div>

      <MarketingHeader />

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 z-10 text-center space-y-8">
        
        {/* Sparkle badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f2e9dc] border border-[#ddc2a0] text-[#7f5631] text-xs font-bold tracking-wide">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Real-time Business Intelligence Engine</span>
        </div>

        {/* Hero Headings */}
        <div className="space-y-4 max-w-4xl mx-auto">
          <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-[#3d3335] leading-[1.1]">
            An AI Business Analyst That{" "}
            <span className="text-[#9c6b3f]">
              Never Clocks Out
            </span>
          </h2>
          <p className="text-[#8a7d78] text-base sm:text-lg max-w-2xl mx-auto font-normal leading-relaxed">
            SAGE connects to your spreadsheets, runs local statistical calculations, and feeds computed trends into Claude to deliver plain-English reports and interactive dashboards.
          </p>
        </div>

        {/* CTA Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-2">
          <Link 
            href="/register" 
            className="w-full sm:w-auto px-8 py-3.5 text-xs font-bold rounded-lg bg-[#9c6b3f] hover:bg-[#7f5631] text-white transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span>Set Up Workspace</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link 
            href="/login" 
            className="w-full sm:w-auto px-8 py-3.5 text-xs font-semibold rounded-lg bg-[#efe8d8] border border-[#e6ddc9] hover:bg-[#f6f1e7] text-[#3d3335] transition-all flex items-center justify-center gap-2"
          >
            <span>Launch Sandbox Guest Mode</span>
            <ChevronRight className="w-4 h-4 text-[#8a7d78]" />
          </Link>
        </div>

      </section>

      {/* Workflow Diagram Section */}
      <section id="workflow" className="max-w-5xl mx-auto px-6 py-12 z-10 w-full">
        <div className="glass-card p-8 space-y-6">
          <div className="text-center">
            <h3 className="text-xs font-bold text-[#9c6b3f] uppercase tracking-widest">SAGE Architecture Flow</h3>
            <p className="text-sm font-bold text-[#3d3335] mt-1">Under the Hood: Secure Data Handling</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center pt-4">
            
            {/* Step 1 */}
            <div className="p-4 rounded-xl border border-[#efe8d8] bg-white text-center space-y-2">
              <div className="inline-block p-2 rounded-lg bg-[#f2e9dc] text-[#9c6b3f]"><Database className="w-5 h-5" /></div>
              <h4 className="text-xs font-bold text-[#3d3335]">1. Ingest Data</h4>
              <p className="text-[10px] text-[#8a7d78] leading-normal">Pulls customer spreadsheet row records.</p>
            </div>

            <div className="hidden md:flex justify-center text-[#6d6062] font-bold">➔</div>

            {/* Step 2 */}
            <div className="p-4 rounded-xl border border-[#efe8d8] bg-white text-center space-y-2">
              <div className="inline-block p-2 rounded-lg bg-amber-50 text-amber-600"><ShieldAlert className="w-5 h-5" /></div>
              <h4 className="text-xs font-bold text-[#3d3335]">2. Profile Locally</h4>
              <p className="text-[10px] text-[#8a7d78] leading-normal">Computes IQR, Z-scores & weekly growth rates.</p>
            </div>

            <div className="hidden md:flex justify-center text-[#6d6062] font-bold">➔</div>

            {/* Step 3 */}
            <div className="p-4 rounded-xl border border-[#efe8d8] bg-white text-center space-y-2">
              <div className="inline-block p-2 rounded-lg bg-[#efe6d3] text-[#a08a5c]"><Sparkles className="w-5 h-5" /></div>
              <h4 className="text-xs font-bold text-[#3d3335]">3. AI Insights</h4>
              <p className="text-[10px] text-[#8a7d78] leading-normal">Claude writes summaries based on computed statistics.</p>
            </div>

            <div className="hidden md:flex justify-center text-[#6d6062] font-bold">➔</div>

            {/* Step 4 */}
            <div className="p-4 rounded-xl border border-[#efe8d8] bg-white text-center space-y-2">
              <div className="inline-block p-2 rounded-lg bg-emerald-50 text-emerald-600"><BarChart3 className="w-5 h-5" /></div>
              <h4 className="text-xs font-bold text-[#3d3335]">4. View Dashboard</h4>
              <p className="text-[10px] text-[#8a7d78] leading-normal">Interactive Recharts panels display findings.</p>
            </div>

          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-16 z-10 w-full space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h3 className="text-xs font-bold text-[#9c6b3f] uppercase tracking-widest">Built for modern businesses</h3>
          <p className="text-2xl sm:text-3xl font-bold text-[#3d3335]">Everything you need to evaluate metrics</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="glass-card p-6 space-y-3 hover:border-[#ddc2a0] transition-all group">
            <div className="p-2.5 rounded-lg bg-[#f2e9dc] text-[#9c6b3f] w-fit group-hover:bg-[#ead9c2] transition-all"><Database className="w-5 h-5" /></div>
            <h4 className="text-sm font-bold text-[#3d3335]">Continuous API Syncing</h4>
            <p className="text-xs text-[#8a7d78] leading-relaxed font-normal">
              Direct connection with Google Cloud credentials callback logs. Stay synced without manual file exports.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3 hover:border-[#9c8480] transition-all group" id="privacy">
            <div className="p-2.5 rounded-lg bg-[#f2e9dc] text-[#7d6864] w-fit group-hover:bg-[#f2e9dc] transition-all"><ShieldAlert className="w-5 h-5" /></div>
            <h4 className="text-sm font-bold text-[#3d3335]">Data Privacy Guarantee</h4>
            <p className="text-xs text-[#8a7d78] leading-relaxed font-normal">
              Raw rows stay strictly in SAGE database. Only computed aggregate statistics (totals, correlation coefficients) are sent to Claude.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3 hover:border-[#e6ddc9] transition-all group">
            <div className="p-2.5 rounded-lg bg-[#efe6d3] text-[#a08a5c] w-fit group-hover:bg-[#e6ddc9] transition-all"><LineChart className="w-5 h-5" /></div>
            <h4 className="text-sm font-bold text-[#3d3335]">Statistical Outlier Profiling</h4>
            <p className="text-xs text-[#8a7d78] leading-relaxed font-normal">
              Locally computes Pearson coefficients, Z-scores, and IQR ranges to flag abnormalities and weekly growth patterns.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3 hover:border-[#e6ddc9] transition-all group">
            <div className="p-2.5 rounded-lg bg-[#f2e9dc] text-[#7d6864] w-fit group-hover:bg-[#f2e9dc] transition-all"><Sparkles className="w-5 h-5" /></div>
            <h4 className="text-sm font-bold text-[#3d3335]">AI-Powered Explanations</h4>
            <p className="text-xs text-[#8a7d78] leading-relaxed font-normal">
              Claude evaluates statistical outputs to write plain-English recommendations and design bespoke chart dashboards dynamically.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3 hover:border-[#ddc2a0] transition-all group">
            <div className="p-2.5 rounded-lg bg-[#f2e9dc] text-[#9c6b3f] w-fit group-hover:bg-[#ead9c2] transition-all"><Users className="w-5 h-5" /></div>
            <h4 className="text-sm font-bold text-[#3d3335]">Collaborative Workspace</h4>
            <p className="text-xs text-[#8a7d78] leading-relaxed font-normal">
              Invite teammates (analysts or read-only viewers) under a single workspace database context to align operational decisions.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3 border-dashed border-[#d9cdb8] hover:border-[#ddc2a0] transition-all flex flex-col justify-center items-center text-center p-8">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 animate-bounce" />
            <h4 className="text-sm font-bold text-[#3d3335] mt-3">Start Syncing Today</h4>
            <Link href="/register" className="text-xs text-[#9c6b3f] font-bold hover:underline mt-1.5 flex items-center gap-1">
              <span>Create Free Account</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

        </div>
      </section>

      <MarketingFooter />

    </div>
  );
}
