"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api, { InsightsPayload, User, Sheet, InsightHistoryEntry, SlackStatus } from "../lib/api";
import {
  TrendingUp, TrendingDown, RefreshCw, LogOut, Sparkles,
  DollarSign, Activity, AlertTriangle, HelpCircle, ArrowUpRight,
  BarChart3, Database, Users, Settings as SettingsIcon, UserPlus, Trash2, Shield, CheckCircle2,
  Hash, Upload, Bell, Clock
} from "lucide-react";
import InsightChart from "./InsightChart";
import ChatPanel from "./ChatPanel";

export default function DashboardClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "connectors" | "team" | "settings">("overview");
  const [toastMessage, setToastMessage] = useState("");

  // Data States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [sheetsList, setSheetsList] = useState<Sheet[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);

  // UI States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStep, setRefreshStep] = useState("");
  const [error, setError] = useState("");

  // Sync state (inside connectors tab)
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [syncRows, setSyncRows] = useState<number | null>(null);

  // Invite states (inside team tab)
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("analyst");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [inviteError, setInviteError] = useState("");

  // Insight history (inside overview tab)
  const [insightHistory, setInsightHistory] = useState<InsightHistoryEntry[]>([]);
  const [selectedInsightId, setSelectedInsightId] = useState<string>("latest");

  // Slack connector (inside connectors tab)
  const [slackStatus, setSlackStatus] = useState<SlackStatus>({ connected: false });
  const [slackWebhookInput, setSlackWebhookInput] = useState("");
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackError, setSlackError] = useState("");

  // File upload connector (inside connectors tab)
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);

  // Settings tab
  const [alertEmailEnabled, setAlertEmailEnabled] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const loadData = async () => {
    try {
      // 1. Fetch current logged-in user profile
      const user = await api.getMe();
      setCurrentUser(user);
      setAlertEmailEnabled(user.alert_email_enabled !== false);

      // 2. Fetch other resources in parallel
      const [profileData, insightsData, sheetsData, historyData, slackData] = await Promise.allSettled([
        api.getLatestProfile(),
        api.getLatestInsights(),
        api.listSheets(),
        api.getInsightHistory(10),
        api.getSlackStatus()
      ]);

      if (profileData.status === "fulfilled") {
        setProfile(profileData.value);
      }

      if (insightsData.status === "fulfilled") {
        setInsights(insightsData.value.insight_data);
      }

      if (sheetsData.status === "fulfilled") {
        setSheetsList(sheetsData.value);
        if (sheetsData.value.length > 0) {
          // Keep the user's current pick across refreshes; default to the first sheet otherwise.
          setSelectedSheetId(prev => prev || sheetsData.value[0].id);
          setSelectedSheetName(prev => prev || sheetsData.value[0].sheets[0] || "");
        }
      }

      if (historyData.status === "fulfilled") {
        setInsightHistory(historyData.value);
      }

      if (slackData.status === "fulfilled") {
        setSlackStatus(slackData.value);
      }

      // 3. Fetch team members (if admin/owner, or just show list)
      try {
        const team = await api.listTeamMembers();
        setTeamMembers(team);
      } catch (err) {
        // Suppress team query error if user lacks permissions
      }

      setError("");
    } catch (err: any) {
      setError("Failed to initialize workspace data. Make sure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectInsightHistory = async (insightId: string) => {
    setSelectedInsightId(insightId);
    if (insightId === "latest") {
      const [profileData, insightsData] = await Promise.allSettled([
        api.getLatestProfile(),
        api.getLatestInsights()
      ]);
      if (profileData.status === "fulfilled") setProfile(profileData.value);
      if (insightsData.status === "fulfilled") setInsights(insightsData.value.insight_data);
      return;
    }

    try {
      const record = await api.getInsightById(insightId);
      setInsights(record.insight_data);
      if (record.computed_stats) setProfile(record.computed_stats);
    } catch (err: any) {
      setError("Failed to load historical insight: " + err.message);
    }
  };

  const handleConnectSlack = async (e: React.FormEvent) => {
    e.preventDefault();
    setSlackError("");
    setSlackLoading(true);
    try {
      await api.connectSlack(slackWebhookInput);
      const status = await api.getSlackStatus();
      setSlackStatus(status);
      setSlackWebhookInput("");
    } catch (err: any) {
      setSlackError(err.message || "Failed to connect Slack.");
    } finally {
      setSlackLoading(false);
    }
  };

  const handleDisconnectSlack = async () => {
    setSlackLoading(true);
    try {
      await api.disconnectSlack();
      setSlackStatus({ connected: false });
    } catch (err: any) {
      setSlackError(err.message || "Failed to disconnect Slack.");
    } finally {
      setSlackLoading(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploadError("");
    setUploadSuccess("");
    setUploadWarnings([]);
    setUploadLoading(true);
    let imported = 0;
    try {
      const res = await api.uploadFile(file);
      imported = res.rows_synced;
      setUploadWarnings(res.warnings || []);

      // Analyse straight away so the user never has to hunt for a separate "refresh" step.
      setRefreshing(true);
      await runAnalysis();
      setUploadSuccess(`Imported ${res.rows_synced} rows from ${file.name} and updated your analysis.`);
    } catch (err: any) {
      setUploadError(
        imported > 0
          ? `Imported ${imported} rows, but the analysis failed: ${friendlyPipelineError(err.message)}`
          : err.message || "Failed to upload file."
      );
    } finally {
      setRefreshing(false);
      setRefreshStep("");
      setUploadLoading(false);
    }
  };

  const friendlyPipelineError = (message: string) =>
    /no synchroni[sz]ed data/i.test(message)
      ? "No data yet. Connect Google Sheets or upload a CSV/XLSX file in Data Connectors first."
      : message;

  const runAnalysis = async () => {
    setRefreshStep("Re-running statistical analysis...");
    await api.triggerProfiling();

    setRefreshStep("Claude compiling insights...");
    await api.generateInsights();

    setRefreshStep("Refreshing workspace...");
    await loadData();
  };

  const handleToggleAlertEmail = async () => {
    const next = !alertEmailEnabled;
    setAlertEmailEnabled(next);
    setSettingsSaving(true);
    try {
      await api.updateMe({ alert_email_enabled: next });
    } catch (err: any) {
      setAlertEmailEnabled(!next);
      setError("Failed to update alert preferences: " + err.message);
    } finally {
      setSettingsSaving(false);
    }
  };

  useEffect(() => {
    if (!api.isLoggedIn()) {
      router.push("/login");
      return;
    }
    loadData();
  }, []);

  useEffect(() => {
    // Read the query string directly off window.location rather than
    // next/navigation's useSearchParams(): this only needs to run once on the
    // real mount, so a plain DOM read avoids pulling in that hook (and the
    // Suspense boundary it requires) for a single one-time check.
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const invited = params.get("invited");
    if (!connected && !invited) return;

    if (connected) {
      const isMock = params.get("mock") === "true";
      const serviceLabel = connected === "google_sheets" ? "Google Sheets" : connected;
      setToastMessage(`${serviceLabel} connected successfully${isMock ? " (mock mode)" : ""}!`);
      setActiveTab("connectors");
    } else if (invited) {
      setToastMessage("Welcome to the workspace! Your invite has been accepted.");
    }

    // Strip the query params so a refresh doesn't re-show the toast.
    window.history.replaceState(null, "", "/dashboard");
  }, []);

  // Separate effect so the auto-dismiss timer isn't cancelled by a re-run of
  // the effect above.
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError("");
    setSyncRows(null);

    try {
      // Google Sheets is optional: uploaded CSV/XLSX data alone is enough to analyse.
      setRefreshStep("Checking connected accounts...");
      let sheets: Sheet[] = [];
      try {
        sheets = await api.listSheets();
      } catch {
        sheets = [];
      }

      if (sheets.length > 0) {
        // Default to currently selected or first available
        const activeSheetId = selectedSheetId || sheets[0].id;
        const activeSheetName = selectedSheetName || (sheets[0].sheets.length > 0 ? sheets[0].sheets[0] : "Sales");

        setRefreshStep("Pulling spreadsheet rows...");
        const syncRes = await api.syncSheet(activeSheetId, activeSheetName);
        setSyncRows(syncRes.rows_synced);
      }

      await runAnalysis();
    } catch (err: any) {
      setError("Refresh failed: " + friendlyPipelineError(err.message));
    } finally {
      setRefreshing(false);
      setRefreshStep("");
    }
  };

  const handleGoogleConnect = async () => {
    try {
      const res = await api.getGoogleLoginUrl();
      window.location.href = res.url;
    } catch (err: any) {
      setError("Failed to start Google connection: " + err.message);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");
    setInviteLoading(true);

    try {
      const member = await api.inviteTeamMember({
        email: inviteEmail,
        name: inviteName || undefined,
        role: inviteRole
      });

      setInviteSuccess(`Invite email sent to ${member.email}. They'll appear as "Pending" until they accept.`);
      // Reset inputs
      setInviteEmail("");
      setInviteName("");
      setInviteRole("analyst");

      // Reload team list
      const team = await api.listTeamMembers();
      setTeamMembers(team);
    } catch (err: any) {
      setInviteError(err.message || "Invitation failed.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleResendInvite = async (memberId: string, email: string) => {
    setError("");
    try {
      await api.resendInvite(memberId);
      setToastMessage(`A fresh invite link was sent to ${email}.`);
    } catch (err: any) {
      setError("Failed to resend invite: " + err.message);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this team member?")) return;
    setError("");
    try {
      await api.deleteTeamMember(memberId);
      // Reload team list
      const team = await api.listTeamMembers();
      setTeamMembers(team);
    } catch (err: any) {
      setError("Failed to delete team member: " + err.message);
    }
  };

  const handleSignOut = () => {
    api.clearToken();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08080c] text-white flex flex-col justify-center items-center gap-4">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-gray-400 text-sm animate-pulse">Loading SAGE Workspace...</p>
      </div>
    );
  }

  const summary = profile?.summary || { total_revenue: 0, total_transactions: 0, avg_transaction_value: 0 };
  const anomalies = profile?.anomalies || [];
  const weekly_metrics = profile?.period_metrics?.weekly || [];
  const latest_week = weekly_metrics[weekly_metrics.length - 1];
  const last_week_growth = latest_week?.growth_pct;

  const currentSheet = sheetsList.find(s => s.id === selectedSheetId);
  const isAdmin = currentUser?.role === "admin";
  const canWrite = currentUser?.role !== "viewer";

  return (
    <div className="min-h-screen bg-[#08080c] text-gray-200 flex flex-col md:flex-row relative">

      {/* Sidebar - Desktop */}
      <aside className="w-full md:w-64 shrink-0 bg-[#0c0c12]/80 border-b md:border-b-0 md:border-r border-white/5 backdrop-blur-lg flex flex-col justify-between py-6 px-4 z-20">
        <div className="space-y-8">
          {/* Brand Logo */}
          <div className="px-3">
            <h1 className="text-2xl font-extrabold text-white tracking-tight bg-gradient-to-r from-white via-indigo-100 to-purple-100 bg-clip-text text-transparent glow-text-indigo">
              SAGE
            </h1>
            <p className="text-[10px] text-gray-500 font-semibold tracking-widest uppercase mt-1">An Analyst Always On</p>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === "overview"
                  ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
                  : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Dashboard Overview</span>
            </button>

            <button
              onClick={() => setActiveTab("connectors")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === "connectors"
                  ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
                  : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Data Connectors</span>
            </button>

            <button
              onClick={() => setActiveTab("team")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === "team"
                  ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
                  : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Team Members</span>
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === "settings"
                  ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
                  : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>Workspace Settings</span>
            </button>
          </nav>
        </div>

        {/* User Card */}
        <div className="pt-6 border-t border-white/5 mt-6 px-3 flex items-center justify-between gap-3">
          <div className="truncate">
            <h4 className="text-xs font-bold text-white truncate">{currentUser?.name || currentUser?.email.split("@")[0]}</h4>
            <span className="text-[10px] text-gray-500 capitalize flex items-center gap-1">
              <Shield className="w-3 h-3 text-indigo-500" />
              {currentUser?.role}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 text-gray-400 hover:text-rose-400 transition-all hover:bg-rose-500/10 rounded-lg shrink-0"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-x-clip">
        {/* Background glow points */}
        <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>

        {/* Top Header */}
        <header className="border-b border-white/5 bg-black/40 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-bold text-white capitalize">
              {activeTab === "overview" && "Dashboard Overview"}
              {activeTab === "connectors" && "Data Connectors"}
              {activeTab === "team" && "Team Management"}
              {activeTab === "settings" && "Workspace Settings"}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {canWrite && <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 text-xs rounded-lg glass-card hover:bg-white/10 text-white font-medium flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
              <span>{refreshing ? refreshStep || "Syncing..." : "Refresh Analysis"}</span>
            </button>}
          </div>
        </header>

        {/* Content Box */}
        <div className="p-6 md:p-8 space-y-8 overflow-y-auto max-w-6xl w-full mx-auto">

          {toastMessage && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <>
              {/* Insight History Selector */}
              {insightHistory.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-gray-500 font-semibold">Viewing:</span>
                  <select
                    value={selectedInsightId}
                    onChange={(e) => handleSelectInsightHistory(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
                  >
                    <option value="latest">Latest</option>
                    {insightHistory.map((h) => (
                      <option key={h.id} value={h.id}>
                        {new Date(h.created_at).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Data quality warnings */}
              {(profile?.data_quality?.warnings?.length ?? 0) > 0 && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs space-y-1.5">
                  <p className="font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Some of your data may not be read correctly</p>
                  {profile.data_quality.warnings.map((w: string, i: number) => <p key={i} className="text-amber-200/80">{w}</p>)}
                </div>
              )}

              {/* Claude Prescriptive recommendation */}
              {insights?.recommendation && (
                <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/20 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between shadow-lg shadow-indigo-500/5">
                  <div className="flex gap-3 items-start">
                    <Sparkles className="w-5.5 h-5.5 text-violet-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-bold text-white text-sm">Claude Analyst Prescriptive Recommendation</h3>
                      <p className="text-gray-300 text-xs mt-0.5 leading-relaxed font-medium">{insights.recommendation}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-6 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Sales</span>
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400"><DollarSign className="w-4 h-4" /></div>
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold text-white">${summary.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-gray-500 mt-1">Gross sales inside sync window</div>
                  </div>
                </div>

                <div className="glass-card p-6 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Transactions</span>
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400"><Activity className="w-4 h-4" /></div>
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold text-white">{summary.total_transactions}</div>
                    <div className="text-[10px] text-gray-500 mt-1">Transaction entries processed</div>
                  </div>
                </div>

                <div className="glass-card p-6 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Average Purchase</span>
                    <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400"><HelpCircle className="w-4 h-4" /></div>
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold text-white">${summary.avg_transaction_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-gray-500 mt-1">Average sale ticket value</div>
                  </div>
                </div>

                <div className="glass-card p-6 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Weekly Growth</span>
                    <div className={`p-2 rounded-lg ${last_week_growth && last_week_growth >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                      {last_week_growth && last_week_growth >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold text-white">
                      {last_week_growth !== null && last_week_growth !== undefined ? `${last_week_growth > 0 ? "+" : ""}${last_week_growth.toFixed(1)}%` : "0.0%"}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">Last period WoW comparison</div>
                  </div>
                </div>
              </div>

              {/* Dynamic Recharts Section */}
              {insights?.insights && insights.insights.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {insights.insights.map((insight, idx) => (
                    <div key={idx} className="glass-card p-6 flex flex-col justify-between gap-4">
                      <div className="space-y-1">
                        <h4 className="font-extrabold text-white text-sm tracking-wide flex items-center gap-2">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                          {insight.title}
                        </h4>
                        <p className="text-xs text-gray-400 leading-relaxed font-normal">{insight.explanation}</p>
                      </div>
                      <InsightChart insight={insight} idx={idx} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="glass-card p-8 text-center text-gray-500 text-xs">
                  No insights generated yet. Click "Refresh Analysis" or sync spreadsheet.
                </div>
              )}

              {/* Anomalies Table */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                  <h4 className="font-extrabold text-white text-sm flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                    <span>Flagged Outliers & Anomalies</span>
                  </h4>
                  <span className="text-[10px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full">
                    {anomalies.length} Flagged
                  </span>
                </div>

                {anomalies.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-400">
                      <thead>
                        <tr className="border-b border-white/5 text-gray-500 font-semibold">
                          <th className="py-2.5">Date</th>
                          <th className="py-2.5">Transaction ID</th>
                          <th className="py-2.5">Amount</th>
                          <th className="py-2.5">Z-Score</th>
                          <th className="py-2.5 text-right">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {anomalies.map((anom: any, index: number) => (
                          <tr key={index} className="hover:bg-white/2 transition-colors">
                            <td className="py-3 font-medium text-white">{anom.date}</td>
                            <td className="py-3 font-mono">{anom.transaction_id}</td>
                            <td className={`py-3 font-bold ${anom.amount < 0 ? "text-rose-400" : "text-amber-400"}`}>
                              ${anom.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3">{anom.z_score !== 0 ? anom.z_score.toFixed(2) : "N/A"}</td>
                            <td className="py-3 text-right text-gray-300 font-medium">{anom.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 py-4 text-center">No anomalies found. Operations in tolerance.</p>
                )}
              </div>
            </>
          )}

          {/* TAB 2: CONNECTORS */}
          {activeTab === "connectors" && (
            <div className="space-y-6">
              {/* Google Connection Card */}
              <div className="glass-card p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base">Google Sheets API</h3>
                      <p className="text-xs text-gray-500">Pull custom business row tables</p>
                    </div>
                  </div>

                  {canWrite && <button
                    onClick={handleGoogleConnect}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-semibold shadow-md shadow-indigo-500/20"
                  >
                    Reconnect Google Account
                  </button>}
                </div>

                {sheetsList.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Connected Spreadsheet</label>
                        <select
                          value={selectedSheetId}
                          onChange={(e) => {
                            setSelectedSheetId(e.target.value);
                            const sh = sheetsList.find(s => s.id === e.target.value);
                            if (sh && sh.sheets.length > 0) {
                              setSelectedSheetName(sh.sheets[0]);
                            }
                          }}
                          className="w-full px-4 py-2.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
                        >
                          {sheetsList.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      {currentSheet && (
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tab Worksheet</label>
                          <select
                            value={selectedSheetName}
                            onChange={(e) => setSelectedSheetName(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
                          >
                            {currentSheet.sheets.map(tab => (
                              <option key={tab} value={tab}>{tab}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {canWrite && <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="w-full py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white font-semibold transition-all text-xs flex justify-center items-center gap-2 shadow-lg shadow-indigo-500/25"
                      >
                        {refreshing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        <span>Sync Selected Worksheet</span>
                      </button>}
                    </div>

                    <div className="p-5 rounded-xl border border-white/5 bg-black/20 flex flex-col justify-between">
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Sync Log & Details</h4>
                        <div className="text-xs text-gray-400 space-y-1">
                          <p><strong>Service Type:</strong> Google Sheets (Read-Only)</p>
                          <p><strong>Spreadsheet ID:</strong> <span className="font-mono text-[10px] break-all">{selectedSheetId}</span></p>
                          <p><strong>Target Tab:</strong> {selectedSheetName}</p>
                          {syncRows !== null && (
                            <p className="text-emerald-400 font-semibold mt-2">✅ Sync Success: {syncRows} rows imported.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500 text-xs border border-dashed border-white/10 rounded-xl">
                    No Google Spreadsheets connected. Please click "Reconnect Google Account" to configure.
                  </div>
                )}
              </div>

              {!canWrite && (
                <div className="p-4 rounded-xl border border-white/5 bg-black/20 flex gap-3 items-center">
                  <Shield className="w-5 h-5 text-gray-500 shrink-0" />
                  <p className="text-xs text-gray-400">You have read-only (viewer) access. Ask a workspace admin for analyst access to sync data or upload files.</p>
                </div>
              )}

              {/* Upload File Card */}
              {canWrite && (
              <div className="glass-card p-6 space-y-4">
                <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                  <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Upload File</h3>
                    <p className="text-xs text-gray-500">Import a CSV or XLSX transaction export as a second data source</p>
                  </div>
                </div>

                {uploadSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs">
                    {uploadSuccess}
                  </div>
                )}
                {uploadError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
                    {uploadError}
                  </div>
                )}
                {uploadWarnings.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs space-y-1">
                    {uploadWarnings.map((w, i) => <p key={i}>{w}</p>)}
                  </div>
                )}

                <label className="flex items-center justify-center gap-2 w-full py-6 rounded-xl border border-dashed border-white/10 hover:border-indigo-500/40 hover:bg-white/5 cursor-pointer transition-all text-xs text-gray-400">
                  {uploadLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                      <span>Uploading & ingesting rows...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Click to choose a .csv or .xlsx file (max 5MB)</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    className="hidden"
                    disabled={uploadLoading}
                    onChange={handleUploadFile}
                  />
                </label>
              </div>
              )}

              {/* Slack Alerts Card */}
              <div className="glass-card p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400">
                      <Hash className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base">Slack Alerts</h3>
                      <p className="text-xs text-gray-500">Post anomaly & insight alerts to a Slack channel</p>
                    </div>
                  </div>
                  {slackStatus.connected && (
                    <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full font-bold border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Connected</span>
                    </span>
                  )}
                </div>

                {slackError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
                    {slackError}
                  </div>
                )}

                {!isAdmin ? (
                  <p className="text-xs text-gray-500">Only workspace administrators can manage Slack alerts.</p>
                ) : slackStatus.connected ? (
                  <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
                    <span className="font-mono truncate">{slackStatus.webhook_url}</span>
                    <button
                      onClick={handleDisconnectSlack}
                      disabled={slackLoading}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 font-semibold shrink-0"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleConnectSlack} className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="url"
                      required
                      value={slackWebhookInput}
                      onChange={(e) => setSlackWebhookInput(e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                      className="flex-1 px-4 py-2.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={slackLoading}
                      className="px-4 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white text-xs font-semibold whitespace-nowrap"
                    >
                      {slackLoading ? "Connecting..." : "Connect Webhook"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: TEAM MEMBERS */}
          {activeTab === "team" && (
            <div className="space-y-6">

              {/* Teammates List */}
              <div className="glass-card p-6">
                <h3 className="text-base font-bold text-white mb-4">Active Team Workspace Members</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-400">
                    <thead>
                      <tr className="border-b border-white/5 text-gray-500 font-semibold">
                        <th className="py-2.5">Name</th>
                        <th className="py-2.5">Email</th>
                        <th className="py-2.5">Workspace Role</th>
                        <th className="py-2.5">Status</th>
                        <th className="py-2.5">Added Date</th>
                        {isAdmin && <th className="py-2.5 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {teamMembers.map((member) => (
                        <tr key={member.id} className="hover:bg-white/2 transition-colors">
                          <td className="py-3 font-semibold text-white">{member.name || "N/A"}</td>
                          <td className="py-3 font-mono">{member.email}</td>
                          <td className="py-3">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              member.role === "admin"
                                ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
                                : member.role === "analyst"
                                ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                                : "bg-zinc-500/10 border-zinc-500/20 text-zinc-400"
                            }`}>
                              {member.role}
                            </span>
                          </td>
                          <td className="py-3">
                            {member.is_active ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/10 border-amber-500/20 text-amber-400">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-gray-500">{new Date(member.created_at).toLocaleDateString()}</td>
                          {isAdmin && (
                            <td className="py-3 text-right">
                              {!member.is_active && (
                                <button
                                  onClick={() => handleResendInvite(member.id, member.email)}
                                  className="px-2 py-1 mr-1 text-[10px] font-semibold text-indigo-300 hover:text-white hover:bg-indigo-500/10 rounded"
                                  title="Send a fresh invite link"
                                >
                                  Resend
                                </button>
                              )}
                              {member.role !== "admin" && (
                                <button
                                  onClick={() => handleDeleteMember(member.id)}
                                  className="p-1 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded"
                                  title="Delete Teammate"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Invite Form Card */}
              {isAdmin ? (
                <div className="glass-card p-6">
                  <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-indigo-400" />
                    <span>Invite Teammate Account</span>
                  </h3>
                  <p className="text-xs text-gray-500 mb-6">An invite email will be sent so they can set their own password. Once accepted, they&apos;ll share your sheets and AI insights database context.</p>

                  {inviteSuccess && (
                    <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs flex gap-2 items-center">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{inviteSuccess}</span>
                    </div>
                  )}

                  {inviteError && (
                    <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
                      {inviteError}
                    </div>
                  )}

                  <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Teammate Name</label>
                      <input
                        type="text"
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-4 py-2.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Email Address</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="teammate@business.com"
                        required
                        className="w-full px-4 py-2.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Workspace Role</label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
                      >
                        <option value="analyst">Analyst (Can sync, refresh stats, chat)</option>
                        <option value="viewer">Viewer (Read-only analytics view)</option>
                      </select>
                    </div>

                    <div className="md:col-span-2 pt-2">
                      <button
                        type="submit"
                        disabled={inviteLoading}
                        className="px-6 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white font-semibold transition-all text-xs flex items-center gap-2 shadow-md shadow-indigo-500/20"
                      >
                        {inviteLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                        <span>Invite Teammate</span>
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-white/5 bg-black/20 flex gap-3 items-center">
                  <Shield className="w-5 h-5 text-gray-500" />
                  <p className="text-xs text-gray-400">Team invite controls are only accessible by Workspace Administrators.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-6 max-w-2xl">
              {/* Profile Card */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-base font-bold text-white border-b border-white/5 pb-3">User Profile Information</h3>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-gray-500">Full Name</p>
                    <p className="font-semibold text-white mt-0.5">{currentUser?.name || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Email Address</p>
                    <p className="font-semibold text-white mt-0.5">{currentUser?.email}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Workspace Role</p>
                    <p className="font-semibold text-white mt-0.5 uppercase tracking-wide">{currentUser?.role}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Account ID</p>
                    <p className="font-mono text-[10px] text-gray-300 mt-0.5">{currentUser?.id}</p>
                  </div>
                </div>
              </div>

              {/* Alert Preferences */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-base font-bold text-white border-b border-white/5 pb-3">Alert Preferences</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <Bell className="w-4 h-4 text-indigo-400 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-white">Email me when anomalies are flagged</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">Sent to workspace admins after each sync that finds outliers or refunds.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleAlertEmail}
                    disabled={settingsSaving}
                    className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${alertEmailEnabled ? "bg-indigo-500" : "bg-white/10"}`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${alertEmailEnabled ? "left-[22px]" : "left-0.5"}`}
                    />
                  </button>
                </div>
              </div>

              {/* Workspace config info */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-base font-bold text-white border-b border-white/5 pb-3">Workspace Database Context</h3>

                <div className="text-xs text-gray-400 leading-relaxed space-y-2">
                  <p>
                    <strong>Workspace Context Mode:</strong> {" "}
                    {currentUser?.workspace_owner_id ? (
                      <span className="text-amber-400">Teammate Sharing Mode</span>
                    ) : (
                      <span className="text-emerald-400">Primary Administrator Workspace</span>
                    )}
                  </p>
                  <p>
                    Your database queries read metrics synced from spreadsheet owner context: {" "}
                    <code className="bg-black/50 border border-white/5 px-2 py-0.5 rounded font-mono text-[10px]">
                      {currentUser?.workspace_owner_id || currentUser?.id}
                    </code>
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      <ChatPanel />
    </div>
  );
}
