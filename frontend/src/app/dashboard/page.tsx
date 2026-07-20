"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api, { InsightsPayload, User, Sheet } from "../../lib/api";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell 
} from "recharts";
import { 
  TrendingUp, TrendingDown, RefreshCw, LogOut, Sparkles, 
  DollarSign, Activity, AlertTriangle, HelpCircle, ArrowUpRight,
  BarChart3, Database, Users, Settings as SettingsIcon, UserPlus, Trash2, Shield, CheckCircle2
} from "lucide-react";

const COLORS = ["#6366f1", "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e", "#10b981"];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#101015]/95 backdrop-blur-md border border-white/10 px-3 py-2 rounded-lg text-xs shadow-2xl">
        <p className="font-semibold text-gray-400">{payload[0].name}</p>
        <p className="font-bold text-indigo-400 mt-0.5">
          ${typeof payload[0].value === 'number' ? payload[0].value.toLocaleString(undefined, { minimumFractionDigits: 2 }) : payload[0].value}
        </p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "connectors" | "team" | "settings">("overview");
  
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
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState("analyst");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [inviteError, setInviteError] = useState("");

  const loadData = async () => {
    try {
      // 1. Fetch current logged-in user profile
      const user = await api.getMe();
      setCurrentUser(user);

      // 2. Fetch other resources in parallel
      const [profileData, insightsData, sheetsData] = await Promise.allSettled([
        api.getLatestProfile(),
        api.getLatestInsights(),
        api.listSheets()
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
          setSelectedSheetId(sheetsData.value[0].id);
          if (sheetsData.value[0].sheets.length > 0) {
            setSelectedSheetName(sheetsData.value[0].sheets[0]);
          }
        }
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

  useEffect(() => {
    if (!api.isLoggedIn()) {
      router.push("/");
      return;
    }
    loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError("");
    setSyncRows(null);
    
    try {
      setRefreshStep("Checking connected accounts...");
      const sheets = await api.listSheets();
      if (sheets.length === 0) {
        throw new Error("No connected Google account found. Go to 'Data Connectors' to log in.");
      }
      
      // Default to currently selected or first available
      const activeSheetId = selectedSheetId || sheets[0].id;
      const activeSheetName = selectedSheetName || (sheets[0].sheets.length > 0 ? sheets[0].sheets[0] : "Sales");
      
      setRefreshStep("Pulling spreadsheet rows...");
      const syncRes = await api.syncSheet(activeSheetId, activeSheetName);
      setSyncRows(syncRes.rows_synced);
      
      setRefreshStep("Re-running statistical analysis...");
      await api.triggerProfiling();
      
      setRefreshStep("Claude compiling insights...");
      await api.generateInsights();
      
      setRefreshStep("Refreshing workspace...");
      await loadData();
      
    } catch (err: any) {
      setError("Refresh failed: " + err.message);
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
        password: invitePassword,
        role: inviteRole
      });
      
      setInviteSuccess(`Successfully invited ${member.name || member.email} as ${member.role}!`);
      // Reset inputs
      setInviteEmail("");
      setInviteName("");
      setInvitePassword("");
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
      <div className="flex-1 flex flex-col min-w-0 relative">
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
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 text-xs rounded-lg glass-card hover:bg-white/10 text-white font-medium flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
              <span>{refreshing ? refreshStep || "Syncing..." : "Refresh Analysis"}</span>
            </button>
          </div>
        </header>

        {/* Content Box */}
        <div className="p-6 md:p-8 space-y-8 overflow-y-auto max-w-6xl w-full mx-auto">
          
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <>
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
                  {insights.insights.map((insight, idx) => {
                    const hasChart = insight.chart_type !== "none" && insight.chart_data && insight.chart_data.length > 0;
                    return (
                      <div key={idx} className="glass-card p-6 flex flex-col justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="font-extrabold text-white text-sm tracking-wide flex items-center gap-2">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                            {insight.title}
                          </h4>
                          <p className="text-xs text-gray-400 leading-relaxed font-normal">{insight.explanation}</p>
                        </div>

                        {hasChart && (
                          <div className="h-60 mt-2 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              {insight.chart_type === "line" || insight.chart_type === "area" ? (
                                <AreaChart data={insight.chart_data} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                                  <defs>
                                    <linearGradient id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.25}/>
                                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.02)" />
                                  <XAxis dataKey="name" stroke="#4b5563" fontSize={9} tickLine={false} />
                                  <YAxis stroke="#4b5563" fontSize={9} tickLine={false} />
                                  <Tooltip content={<CustomTooltip />} />
                                  <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill={`url(#grad-${idx})`} />
                                </AreaChart>
                              ) : insight.chart_type === "bar" ? (
                                <BarChart data={insight.chart_data} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.02)" />
                                  <XAxis dataKey="name" stroke="#4b5563" fontSize={9} tickLine={false} />
                                  <YAxis stroke="#4b5563" fontSize={9} tickLine={false} />
                                  <Tooltip content={<CustomTooltip />} />
                                  <Bar dataKey="value" fill="#8b5cf6" radius={[3, 3, 0, 0]}>
                                    {insight.chart_data.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              ) : (
                                <PieChart>
                                  <Tooltip content={<CustomTooltip />} />
                                  <Pie
                                    data={insight.chart_data}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={70}
                                    paddingAngle={3}
                                    dataKey="value"
                                  >
                                    {insight.chart_data.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                  </Pie>
                                </PieChart>
                              )}
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    );
                  })}
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

                  <button
                    onClick={handleGoogleConnect}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-semibold shadow-md shadow-indigo-500/20"
                  >
                    Reconnect Google Account
                  </button>
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

                      <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="w-full py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white font-semibold transition-all text-xs flex justify-center items-center gap-2 shadow-lg shadow-indigo-500/25"
                      >
                        {refreshing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        <span>Sync Selected Worksheet</span>
                      </button>
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
                          <td className="py-3 text-gray-500">{new Date(member.created_at).toLocaleDateString()}</td>
                          {isAdmin && (
                            <td className="py-3 text-right">
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
                  <p className="text-xs text-gray-500 mb-6">Create login credentials for a new teammate. They will immediately share your sheets and AI insights database context.</p>
                  
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
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Create Password</label>
                      <input
                        type="password"
                        value={invitePassword}
                        onChange={(e) => setInvitePassword(e.target.value)}
                        placeholder="••••••••"
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
    </div>
  );
}
