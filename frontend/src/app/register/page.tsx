"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "../../lib/api";
import { RefreshCw, AlertCircle, ArrowLeft, ShieldCheck } from "lucide-react";

export default function Register() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // 1. Create User
      await api.register(email, password);
      // 2. Perform auto-login to acquire JWT
      await api.login(email, password);
      // 3. Navigate to onboarding sheet setup
      router.push("/onboarding");
    } catch (err: any) {
      setError(err.message || "Registration failed. Try a different email.");
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
            <h2 className="text-2xl font-extrabold text-white tracking-tight">Create Your Account</h2>
            <p className="text-xs text-gray-500 mt-1.5 font-medium">Join SAGE to build your autonomous AI BI analyst</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4 mb-6">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@business.com"
                required
                className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-all text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Create Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-all text-xs"
              />
            </div>

            <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-lg text-[10px] text-indigo-300 leading-normal flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-indigo-400" />
              <span>SAGE operates on database isolation parameters. Your raw sheet transactions are processed locally and never directly shared with public AI models.</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold transition-all shadow-lg shadow-indigo-500/25 flex justify-center items-center gap-2 text-xs"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Sign Up"}
            </button>
          </form>
        </div>

        <div className="text-center text-xs text-gray-500">
          <span>Already have an account? </span>
          <Link href="/login" className="text-indigo-400 hover:underline font-bold transition-all">Sign In</Link>
        </div>
      </div>
    </main>
  );
}
