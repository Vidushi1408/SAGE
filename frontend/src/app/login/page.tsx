"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "../../lib/api";
import { Sparkles, RefreshCw, AlertCircle, ArrowLeft, ShieldCheck } from "lucide-react";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const checkRedirection = async () => {
    // Any existing data source counts: a connected Google account or already-analysed
    // (e.g. uploaded) data. Only brand-new workspaces go through onboarding.
    const [sheets, profile] = await Promise.allSettled([api.listSheets(), api.getLatestProfile()]);
    const hasSheets = sheets.status === "fulfilled" && sheets.value.length > 0;
    const hasProfile = profile.status === "fulfilled";
    router.push(hasSheets || hasProfile ? "/dashboard" : "/onboarding");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.login(email, password);
      await checkRedirection();
    } catch (err: any) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await api.login("demo@sage.ai", "sage_demo_pass");
      await checkRedirection();
    } catch (err: any) {
      setError(err.message || "Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#08080c] flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background glow points */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md space-y-6 z-10">
        
        {/* Navigation link back to home */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <div className="glass-card p-8 shadow-2xl relative">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-extrabold text-white tracking-tight">Welcome Back</h2>
            <p className="text-xs text-gray-500 mt-1.5 font-medium">Enter your credentials to enter SAGE workspace</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 mb-6">
            <div>
              <label htmlFor="field-email-address" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Email Address</label>
              <input id="field-email-address" 
                type="email" autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@business.com"
                required
                className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-all text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="field-password" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Password</label>
                <Link href="/forgot-password" className="text-[10px] text-indigo-400 hover:underline font-semibold">Forgot password?</Link>
              </div>
              <input id="field-password" 
                type="password" autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-all text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold transition-all shadow-lg shadow-indigo-500/25 flex justify-center items-center gap-2 text-xs"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Sign In"}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-[#121218] px-3 text-gray-500 font-semibold tracking-wider">Or demo instantly</span></div>
          </div>

          <button
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full py-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold transition-all flex justify-center items-center gap-2 hover:border-violet-500/40 text-xs shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
            <span>Launch Demo Guest Mode</span>
          </button>
        </div>

        <div className="text-center text-xs text-gray-500">
          <span>Don't have an account? </span>
          <Link href="/register" className="text-indigo-400 hover:underline font-bold transition-all">Sign Up</Link>
        </div>
      </div>
    </main>
  );
}
