"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import api, { errorMessage } from "../../lib/api";
import { RefreshCw, AlertCircle, ArrowLeft } from "lucide-react";

export default function AcceptInvite() {
  // Read the token directly from the browser's URL rather than next/navigation's
  // useSearchParams(), which needs a Suspense boundary for a value we only need once.
  const [token, setToken] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the browser URL on mount
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
      // Full navigation so the dashboard mounts fresh with the new session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/dashboard?invited=true";
    } catch (err) {
      setError(errorMessage(err) || "This invite link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f1e7] flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">

      <div className="w-full max-w-md space-y-6 z-10">
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
            <h2 className="text-2xl font-bold text-[#3d3335] tracking-tight">Accept Your Invite</h2>
            <p className="text-xs text-[#8a7d78] mt-1.5 font-medium">Set your name and password to join the workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="field-your-name" className="block text-[10px] font-bold text-[#8a7d78] uppercase tracking-widest mb-1.5">Your Name</label>
              <input id="field-your-name" 
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Analyst"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-[#9c6b3f] hover:bg-[#7f5631] text-white font-semibold transition-all shadow-sm flex justify-center items-center gap-2 text-xs"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Accept Invite & Sign In"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
