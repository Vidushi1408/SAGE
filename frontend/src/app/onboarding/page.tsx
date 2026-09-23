"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api, { Sheet, errorMessage } from "../../lib/api";
import { Database, Upload, RefreshCw, CheckCircle, BarChart3, AlertCircle, LogOut } from "lucide-react";

export default function Onboarding() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [sheetsList, setSheetsList] = useState<Sheet[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [selectedSheetName, setSelectedSheetName] = useState("");

  // Sync Pipeline steps
  const [syncStep, setSyncStep] = useState<"idle" | "pulling" | "profiling" | "generating" | "completed">("idle");

  const checkConnectionStatus = async () => {
    setSheetsLoading(true);
    try {
      const sheets = await api.listSheets();
      setSheetsList(sheets);
      setIsConnected(true);
      if (sheets.length > 0) {
        setSelectedSheetId(sheets[0].id);
        if (sheets[0].sheets.length > 0) {
          setSelectedSheetName(sheets[0].sheets[0]);
        }
      }
    } catch {
      setIsConnected(false);
    } finally {
      setSheetsLoading(false);
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- run once on mount */
  useEffect(() => {
    if (!api.isLoggedIn()) {
      router.push("/login");
      return;
    }
    checkConnectionStatus();
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  const handleGoogleConnect = async () => {
    try {
      const res = await api.getGoogleLoginUrl();
      window.location.href = res.url;
    } catch (err) {
      setError("Failed to start Google connection: " + errorMessage(err));
    }
  };

  const startAnalysisPipeline = async () => {
    if (!selectedSheetId || !selectedSheetName) {
      setError("Please select a spreadsheet and sheet name to sync.");
      return;
    }

    setError("");
    setSyncStep("pulling");

    try {
      // Step 1: Pull/Sync Data rows
      await api.syncSheet(selectedSheetId, selectedSheetName);
      
      // Step 2: Statistical Profiling
      setSyncStep("profiling");
      await api.triggerProfiling();
      
      // Step 3: Claude Insight Generation
      setSyncStep("generating");
      await api.generateInsights();
      
      setSyncStep("completed");
      setTimeout(() => {
        router.push("/dashboard");
      }, 1000);

    } catch (err) {
      setSyncStep("idle");
      setError("Analysis pipeline failed: " + errorMessage(err));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setError("");
    setSyncStep("pulling");
    try {
      await api.uploadFile(file);
      setSyncStep("profiling");
      await api.triggerProfiling();
      setSyncStep("generating");
      await api.generateInsights();
      setSyncStep("completed");
      setTimeout(() => router.push("/dashboard"), 1000);
    } catch (err) {
      setSyncStep("idle");
      setError("Could not process that file: " + errorMessage(err));
    }
  };

  const handleSignOut = () => {
    api.clearToken();
    router.push("/");
  };

  const currentSheet = sheetsList.find(s => s.id === selectedSheetId);

  return (
    <main className="min-h-screen bg-[#f6f1e7] flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">

      <div className="w-full max-w-md space-y-6 z-10">
        
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#3d3335] tracking-tight">
            Data Setup
          </h1>
          <p className="text-xs text-[#8a7d78] mt-1.5 font-medium">Connect your spreadsheet data to get started</p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <div className="glass-card p-8 shadow-lg relative space-y-6">
          <h2 className="text-base font-bold text-[#3d3335] text-center">Connect Your Data Account</h2>
          <p className="text-xs text-[#8a7d78] text-center leading-normal">SAGE requires a connected data table to run local statistics and compile AI insights.</p>

          {/* Google Sheets Integration Card */}
          <div className="p-4 rounded-xl border border-[#efe8d8] bg-[#f6f1e7] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#3d3335] text-xs">Google Sheets</h3>
                  <p className="text-[10px] text-[#8a7d78]">Sync customer transaction sheets</p>
                </div>
              </div>

              {isConnected ? (
                <span className="flex items-center gap-1.5 text-[10px] text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full font-bold border border-emerald-500/20">
                  <CheckCircle className="w-3 h-3" />
                  <span>Connected</span>
                </span>
              ) : (
                <button
                  onClick={handleGoogleConnect}
                  disabled={sheetsLoading}
                  className="text-[10px] px-3.5 py-1.5 rounded-lg bg-[#efe8d8] border border-[#e6ddc9] hover:bg-[#f6f1e7] text-[#3d3335] font-bold transition-all"
                >
                  Connect
                </button>
              )}
            </div>

            {isConnected && (
              <div className="space-y-3 pt-3 border-t border-[#efe8d8]">
                <div>
                  <label className="block text-[9px] font-bold text-[#8a7d78] uppercase tracking-widest mb-1">Select Spreadsheet</label>
                  <select
                    value={selectedSheetId}
                    onChange={(e) => {
                      setSelectedSheetId(e.target.value);
                      const sh = sheetsList.find(s => s.id === e.target.value);
                      if (sh && sh.sheets.length > 0) {
                        setSelectedSheetName(sh.sheets[0]);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#e6ddc9] text-[#3d3335] text-xs focus:outline-none focus:border-[#b9855a] transition-all"
                  >
                    {sheetsList.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {currentSheet && (
                  <div>
                    <label className="block text-[9px] font-bold text-[#8a7d78] uppercase tracking-widest mb-1">Select Sheet Tab</label>
                    <select
                      value={selectedSheetName}
                      onChange={(e) => setSelectedSheetName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-[#e6ddc9] text-[#3d3335] text-xs focus:outline-none focus:border-[#b9855a] transition-all"
                    >
                      {currentSheet.sheets.map(tab => (
                        <option key={tab} value={tab}>{tab}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pipeline Loading State Indicator */}
          {syncStep !== "idle" && (
            <div className="p-4 rounded-xl bg-[#f2e9dc] border border-[#ddc2a0] text-[#66431f] space-y-3">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#9c6b3f]" />
                  {syncStep === "pulling" && "Pulling spreadsheet row entries..."}
                  {syncStep === "profiling" && "Running statistical calculations..."}
                  {syncStep === "generating" && "Claude API compiling insights..."}
                  {syncStep === "completed" && "Analysis workspace ready!"}
                </span>
                <span>{syncStep === "completed" ? "100%" : "Processing"}</span>
              </div>
              
              {/* Visual Progress Bar */}
              <div className="w-full h-1.5 bg-[#ead9c2] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#9c6b3f] transition-all duration-500"
                  style={{
                    width: 
                      syncStep === "pulling" ? "25%" : 
                      syncStep === "profiling" ? "60%" : 
                      syncStep === "generating" ? "90%" : "100%"
                  }}
                ></div>
              </div>
            </div>
          )}

          {isConnected && syncStep === "idle" && (
            <button
              onClick={startAnalysisPipeline}
              className="w-full py-3 rounded-lg bg-[#9c6b3f] hover:bg-[#7f5631] text-white font-semibold transition-all shadow-sm flex justify-center items-center gap-2 text-xs"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Begin Analysis Pipeline</span>
            </button>
          )}

          <div className="flex items-center gap-3 text-[10px] text-[#6d6062] uppercase tracking-widest">
            <div className="flex-1 border-t border-[#efe8d8]"></div><span>or</span><div className="flex-1 border-t border-[#efe8d8]"></div>
          </div>

          <label className="flex items-center justify-center gap-2 w-full py-4 rounded-xl border border-dashed border-[#d9cdb8] hover:border-[#b9855a]/40 hover:bg-[#efe8d8] cursor-pointer transition-all text-xs text-[#8a7d78]">
            <Upload className="w-4 h-4" />
            <span>Upload a CSV or XLSX file instead</span>
            <input type="file" accept=".csv,.xlsx" className="hidden" disabled={syncStep !== "idle"} onChange={handleFileUpload} />
          </label>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full text-center text-xs text-[#8a7d78] hover:text-[#3d3335] transition-all"
          >
            Skip for now — take me to the dashboard
          </button>

          <button
            onClick={handleSignOut}
            className="w-full text-center text-xs text-[#8a7d78] hover:text-[#3d3335] transition-all underline flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </main>
  );
}
