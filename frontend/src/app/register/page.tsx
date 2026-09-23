"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api, { errorMessage } from "../../lib/api";
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
    } catch (err) {
      setError(errorMessage(err) || "Registration failed. Try a different email.");
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
            <h2 className="text-2xl font-bold text-[#3d3335] tracking-tight">Create Your Account</h2>
            <p className="text-xs text-[#8a7d78] mt-1.5 font-medium">Join SAGE to build your autonomous AI BI analyst</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4 mb-6">
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
              <label htmlFor="field-create-password" className="block text-[10px] font-bold text-[#8a7d78] uppercase tracking-widest mb-1.5">Create Password</label>
              <input id="field-create-password" 
                type="password" minLength={8} autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-lg bg-white border border-[#e6ddc9] text-[#3d3335] placeholder-[#a89b93] focus:outline-none focus:border-[#b9855a] transition-all text-xs"
              />
            </div>

            <p className="text-[10px] text-[#8a7d78] -mt-2">Use at least 8 characters.</p>

            <div className="p-3 bg-[#f2e9dc] border border-[#ead9c2] rounded-lg text-[10px] text-[#7f5631] leading-normal flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-[#9c6b3f]" />
              <span>SAGE operates on database isolation parameters. Your raw sheet transactions are processed locally and never directly shared with public AI models.</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-[#9c6b3f] hover:bg-[#7f5631] text-white font-semibold transition-all shadow-sm flex justify-center items-center gap-2 text-xs"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Sign Up"}
            </button>
          </form>
        </div>

        <div className="text-center text-xs text-[#8a7d78]">
          <span>Already have an account? </span>
          <Link href="/login" className="text-[#9c6b3f] hover:underline font-bold transition-all">Sign In</Link>
        </div>
      </div>
    </main>
  );
}
