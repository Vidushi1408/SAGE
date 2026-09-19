"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import api from "../../lib/api";
import { RefreshCw, AlertCircle, ArrowLeft } from "lucide-react";

export default function AcceptInvite() {
  // Read the token directly from the browser's URL rather than next/navigation's
  // useSearchParams(), which needs a Suspense boundary for a value we only need once.
  const [token, setToken] = useState("");
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("This invite link is missing its token. Ask your admin to resend it.");
      return;
    }

    setLoading(true);
    try {
      const member = await api.acceptInvite(token, name, password);
      // acceptInvite doesn't issue a session token, so log in immediately after with the new password
      await api.login(member.email, password);
      window.location.href = "/dashboard?invited=true";
    } catch (err: any) {
      setError(err.message || "This invite link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#08080c] flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md space-y-6 z-10">
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
            <h2 className="text-2xl font-extrabold text-white tracking-tight">Accept Your Invite</h2>
            <p className="text-xs text-gray-500 mt-1.5 font-medium">Set your name and password to join the workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="field-your-name" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Your Name</label>
              <input id="field-your-name" 
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Analyst"
                required
                className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-all text-xs"
              />
            </div>

            <div>
              <label htmlFor="field-create-password" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Create Password</label>
              <input id="field-create-password" 
                type="password" minLength={8} autoComplete="new-password"
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
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Accept Invite & Sign In"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
