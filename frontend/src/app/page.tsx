"use client";

import React from "react";
import Link from "next/link";
import { 
  Sparkles, Database, ShieldAlert, ArrowRight, BarChart3, LineChart, Users, CheckCircle2, ChevronRight 
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#08080c] text-gray-200 relative overflow-hidden flex flex-col justify-between">
      
      {/* Background glow points */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute top-[40%] left-[-10%] w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[20%] w-[500px] h-[500px] bg-pink-500/5 rounded-full blur-[140px] pointer-events-none"></div>

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none"></div>

      {/* Top Navbar */}
      <header className="border-b border-white/5 bg-[#08080c]/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white tracking-tight bg-gradient-to-r from-white via-indigo-100 to-purple-100 bg-clip-text text-transparent glow-text-indigo">
              SAGE
            </h1>
            <span className="text-[9px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">v1.0</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-gray-400">
            <a href="#features" className="hover:text-white transition-colors">Platform Features</a>
            <a href="#privacy" className="hover:text-white transition-colors">Data Privacy Core</a>
            <a href="#workflow" className="hover:text-white transition-colors">How It Works</a>
          </nav>

          <div className="flex items-center gap-4">
            <Link 
              href="/login" 
              className="text-xs font-semibold text-gray-400 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link 
              href="/register" 
              className="px-4 py-2 text-xs font-bold bg-white text-black hover:bg-gray-200 rounded-lg transition-all shadow-md shadow-white/5"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 z-10 text-center space-y-8">
        
        {/* Sparkle badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-bold tracking-wide animate-pulse">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Real-time Business Intelligence Engine</span>
        </div>

        {/* Hero Headings */}
        <div className="space-y-4 max-w-4xl mx-auto">
          <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
            An AI Business Analyst That{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Never Clocks Out
            </span>
          </h2>
          <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto font-normal leading-relaxed">
            SAGE connects to your spreadsheets, runs local statistical calculations, and feeds computed trends into Claude to deliver plain-English reports and interactive dashboards.
          </p>
        </div>

        {/* CTA Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-2">
          <Link 
            href="/register" 
            className="w-full sm:w-auto px-8 py-3.5 text-xs font-bold rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
          >
            <span>Set Up Workspace</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link 
            href="/login" 
            className="w-full sm:w-auto px-8 py-3.5 text-xs font-semibold rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all flex items-center justify-center gap-2"
          >
            <span>Launch Sandbox Guest Mode</span>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </Link>
        </div>

      </section>

      {/* Workflow Diagram Section */}
      <section id="workflow" className="max-w-5xl mx-auto px-6 py-12 z-10 w-full">
        <div className="glass-card p-8 space-y-6">
          <div className="text-center">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">SAGE Architecture Flow</h3>
            <p className="text-sm font-extrabold text-white mt-1">Under the Hood: Secure Data Handling</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center pt-4">
            
            {/* Step 1 */}
            <div className="p-4 rounded-xl border border-white/5 bg-black/40 text-center space-y-2">
              <div className="inline-block p-2 rounded-lg bg-indigo-500/10 text-indigo-400"><Database className="w-5 h-5" /></div>
              <h4 className="text-xs font-bold text-white">1. Ingest Data</h4>
              <p className="text-[10px] text-gray-500 leading-normal">Pulls customer spreadsheet row records.</p>
            </div>

            <div className="hidden md:flex justify-center text-gray-600 font-bold">➔</div>

            {/* Step 2 */}
            <div className="p-4 rounded-xl border border-white/5 bg-black/40 text-center space-y-2">
              <div className="inline-block p-2 rounded-lg bg-amber-500/10 text-amber-400"><ShieldAlert className="w-5 h-5" /></div>
              <h4 className="text-xs font-bold text-white">2. Profile Locally</h4>
              <p className="text-[10px] text-gray-500 leading-normal">Computes IQR, Z-scores & weekly growth rates.</p>
            </div>

            <div className="hidden md:flex justify-center text-gray-600 font-bold">➔</div>

            {/* Step 3 */}
            <div className="p-4 rounded-xl border border-white/5 bg-black/40 text-center space-y-2">
              <div className="inline-block p-2 rounded-lg bg-pink-500/10 text-pink-400"><Sparkles className="w-5 h-5" /></div>
              <h4 className="text-xs font-bold text-white">3. AI Insights</h4>
              <p className="text-[10px] text-gray-500 leading-normal">Claude writes summaries based on computed statistics.</p>
            </div>

            <div className="hidden md:flex justify-center text-gray-600 font-bold">➔</div>

            {/* Step 4 */}
            <div className="p-4 rounded-xl border border-white/5 bg-black/40 text-center space-y-2">
              <div className="inline-block p-2 rounded-lg bg-emerald-500/10 text-emerald-400"><BarChart3 className="w-5 h-5" /></div>
              <h4 className="text-xs font-bold text-white">4. View Dashboard</h4>
              <p className="text-[10px] text-gray-500 leading-normal">Interactive Recharts panels display findings.</p>
            </div>

          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-16 z-10 w-full space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Built for modern businesses</h3>
          <p className="text-2xl sm:text-3xl font-extrabold text-white">Everything you need to evaluate metrics</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="glass-card p-6 space-y-3 hover:border-indigo-500/20 transition-all group">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 w-fit group-hover:bg-indigo-500/20 transition-all"><Database className="w-5 h-5" /></div>
            <h4 className="text-sm font-bold text-white">Continuous API Syncing</h4>
            <p className="text-xs text-gray-400 leading-relaxed font-normal">
              Direct connection with Google Cloud credentials callback logs. Stay synced without manual file exports.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3 hover:border-purple-500/20 transition-all group" id="privacy">
            <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 w-fit group-hover:bg-purple-500/20 transition-all"><ShieldAlert className="w-5 h-5" /></div>
            <h4 className="text-sm font-bold text-white">Data Privacy Guarantee</h4>
            <p className="text-xs text-gray-400 leading-relaxed font-normal">
              Raw rows stay strictly in SAGE database. Only computed aggregate statistics (totals, correlation coefficients) are sent to Claude.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3 hover:border-pink-500/20 transition-all group">
            <div className="p-2.5 rounded-lg bg-pink-500/10 text-pink-400 w-fit group-hover:bg-pink-500/20 transition-all"><LineChart className="w-5 h-5" /></div>
            <h4 className="text-sm font-bold text-white">Statistical Outlier Profiling</h4>
            <p className="text-xs text-gray-400 leading-relaxed font-normal">
              Locally computes Pearson coefficients, Z-scores, and IQR ranges to flag abnormalities and weekly growth patterns.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3 hover:border-pink-500/20 transition-all group">
            <div className="p-2.5 rounded-lg bg-violet-500/10 text-violet-400 w-fit group-hover:bg-violet-500/20 transition-all"><Sparkles className="w-5 h-5" /></div>
            <h4 className="text-sm font-bold text-white">AI-Powered Explanations</h4>
            <p className="text-xs text-gray-400 leading-relaxed font-normal">
              Claude evaluates statistical outputs to write plain-English recommendations and design bespoke chart dashboards dynamically.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3 hover:border-indigo-500/20 transition-all group">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 w-fit group-hover:bg-indigo-500/20 transition-all"><Users className="w-5 h-5" /></div>
            <h4 className="text-sm font-bold text-white">Collaborative Workspace</h4>
            <p className="text-xs text-gray-400 leading-relaxed font-normal">
              Invite teammates (analysts or read-only viewers) under a single workspace database context to align operational decisions.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3 border-dashed border-white/10 hover:border-indigo-500/20 transition-all flex flex-col justify-center items-center text-center p-8">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-bounce" />
            <h4 className="text-sm font-bold text-white mt-3">Start Syncing Today</h4>
            <Link href="/register" className="text-xs text-indigo-400 font-bold hover:underline mt-1.5 flex items-center gap-1">
              <span>Create Free Account</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-16 bg-black/20 text-xs text-gray-500">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <p className="font-bold text-gray-400">SAGE Platform &copy; 2026</p>
            <p className="mt-0.5">Continuous business growth insights engine.</p>
          </div>
          <div className="flex gap-6">
            <Link href="/login" className="hover:text-white transition-colors">Admin Login</Link>
            <Link href="/register" className="hover:text-white transition-colors">Register Workspace</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
