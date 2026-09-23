"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api, { errorMessage } from "../../lib/api";
import { Sparkles, RefreshCw, AlertCircle, ArrowLeft } from "lucide-react";

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
    } catch (err) {
      setError(errorMessage(err) || "Invalid email or password");
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
    } catch (err) {
      setError(errorMessage(err) || "Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f1e7] flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">

      <div className="w-full max-w-md space-y-6 z-10">
        
        {/* Navigation link back to home */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#8a7d78] hover:text-[#3d3335] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <div className="glass-card p-8 shadow-lg relative">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-[#3d3335] tracking-tight">Welcome Back</h2>
            <p className="text-xs text-[#8a7d78] mt-1.5 font-medium">Enter your credentials to enter SAGE workspace</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 mb-6">
            <div>
              <label htmlFor="field-email-address" className="block text-[10px] font-bold text-[#8a7d78] uppercase tracking-widest mb-1.5">Email Address</label>
              <input id="field-email-address" 
                type="email" autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@business.com"
                required
                className="w-full px-4 py-3 rounded-lg bg-white border border-[#e6ddc9] text-[#3d3335] placeholder-[#a89b93] focus:outline-none focus:border-[#b9855a] transition-all text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="field-password" className="block text-[10px] font-bold text-[#8a7d78] uppercase tracking-widest">Password</label>
                <Link href="/forgot-password" className="text-[10px] text-[#9c6b3f] hover:underline font-semibold">Forgot password?</Link>
              </div>
              <input id="field-password" 
                type="password" autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-lg bg-white border border-[#e6ddc9] text-[#3d3335] placeholder-[#a89b93] focus:outline-none focus:border-[#b9855a] transition-all text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-[#9c6b3f] hover:bg-[#7f5631] text-white font-semibold transition-all shadow-sm flex justify-center items-center gap-2 text-xs"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Sign In"}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#e6ddc9]"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-white px-3 text-[#8a7d78] font-semibold tracking-wider">Or demo instantly</span></div>
          </div>

          <button
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full py-3 rounded-lg bg-[#efe8d8] border border-[#e6ddc9] hover:bg-[#f6f1e7] text-[#3d3335] font-semibold transition-all flex justify-center items-center gap-2 hover:border-[#9c8480]/40 text-xs shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#9c6b3f] animate-pulse" />
            <span>Launch Demo Guest Mode</span>
          </button>
        </div>

        <div className="text-center text-xs text-[#8a7d78]">
          <span>Don&apos;t have an account? </span>
          <Link href="/register" className="text-[#9c6b3f] hover:underline font-bold transition-all">Sign Up</Link>
        </div>
      </div>
    </main>
  );
}
