"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import api, {
  GoogleStatus, InsightHistoryEntry, InsightsPayload, ProfileData, Sheet, SlackStatus, User, errorMessage
} from "../../lib/api";

export interface WorkspaceContextValue {
  loading: boolean;
  user: User | null;
  isAdmin: boolean;
  canWrite: boolean;
  profile: ProfileData | null;
  insights: InsightsPayload | null;
  insightHistory: InsightHistoryEntry[];
  selectedInsightId: string;
  selectInsight: (id: string) => Promise<void>;
  sheets: Sheet[];
  selectedSheetId: string;
  selectedSheetName: string;
  selectSheet: (id: string) => void;
  selectSheetName: (name: string) => void;
  slack: SlackStatus;
  google: GoogleStatus;
  setGoogle: (g: GoogleStatus) => void;
  /** Re-fetch the Google connection status and spreadsheet list. */
  reloadGoogle: () => Promise<void>;
  setSlack: (s: SlackStatus) => void;
  team: User[];
  reloadTeam: () => Promise<void>;
  syncRows: number | null;
  /** True once at least one analysis has produced transaction stats. */
  hasData: boolean;
  lastAnalysedAt: string | null;
  refreshing: boolean;
  refreshStep: string;
  /** Sync the selected sheet (if any) and re-run the whole pipeline. */
  refreshAnalysis: () => Promise<void>;
  /** Re-run profiling + insights on whatever data is already imported. */
  runAnalysis: () => Promise<void>;
  reload: () => Promise<void>;
  updateUser: (u: User) => void;
  error: string;
  setError: (msg: string) => void;
  toast: string;
  showToast: (msg: string) => void;
  signOut: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}

export function friendlyPipelineError(message: string): string {
  return /no synchroni[sz]ed data/i.test(message)
    ? "No data yet. Connect Google Sheets or upload a CSV/XLSX file on the Data page first."
    : message;
}

export default function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [insightHistory, setInsightHistory] = useState<InsightHistoryEntry[]>([]);
  const [selectedInsightId, setSelectedInsightId] = useState("latest");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [slack, setSlack] = useState<SlackStatus>({ connected: false });
  const [google, setGoogle] = useState<GoogleStatus>({ connected: false });
  const [team, setTeam] = useState<User[]>([]);
  const [syncRows, setSyncRows] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStep, setRefreshStep] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => setToast(msg), []);

  const load = useCallback(async () => {
    try {
      const me = await api.getMe();
      setUser(me);

      const [profileRes, insightsRes, sheetsRes, historyRes, slackRes, googleRes] = await Promise.allSettled([
        api.getLatestProfile(),
        api.getLatestInsights(),
        api.listSheets(),
        api.getInsightHistory(20),
        api.getSlackStatus(),
        api.getGoogleStatus()
      ]);

      if (profileRes.status === "fulfilled") setProfile(profileRes.value);
      if (insightsRes.status === "fulfilled") setInsights(insightsRes.value.insight_data);
      if (historyRes.status === "fulfilled") setInsightHistory(historyRes.value);
      if (slackRes.status === "fulfilled") setSlack(slackRes.value);
      if (googleRes.status === "fulfilled") setGoogle(googleRes.value);
      // No connection means no stale spreadsheet list either (e.g. right after disconnecting).
      if (googleRes.status === "fulfilled" && !googleRes.value.connected) setSheets([]);
      if (sheetsRes.status === "fulfilled") {
        setSheets(sheetsRes.value);
        if (sheetsRes.value.length > 0) {
          // Keep the user's pick across refreshes; default to the first sheet otherwise.
          setSelectedSheetId(prev => prev || sheetsRes.value[0].id);
          setSelectedSheetName(prev => prev || sheetsRes.value[0].sheets[0] || "");
        }
      }

      try {
        setTeam(await api.listTeamMembers());
      } catch {
        // Team list is admin-only; ignore for other roles.
      }
      setError("");
    } catch (err) {
      setError(errorMessage(err) || "Failed to load your workspace. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auth gate + first load, and the one-time toast after OAuth / invite redirects.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!api.isLoggedIn()) {
      router.replace("/login");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const invited = params.get("invited");
    const googleError = params.get("google_error");
    /* eslint-disable react-hooks/set-state-in-effect -- one-time toast from the redirect query string, then initial load */
    if (connected) {
      const label = connected === "google_sheets" ? "Google Sheets" : connected;
      setToast(`${label} connected successfully${params.get("mock") === "true" ? " (mock mode)" : ""}!`);
      router.replace("/data");
    } else if (googleError) {
      setError(googleError);
      router.replace("/data");
    } else if (invited) {
      setToast("Welcome to the workspace! Your invite has been accepted.");
      router.replace("/dashboard");
    }
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const runAnalysis = useCallback(async () => {
    setRefreshStep("Re-running statistical analysis...");
    await api.triggerProfiling();
    setRefreshStep("Compiling insights...");
    await api.generateInsights();
    setRefreshStep("Refreshing workspace...");
    setSelectedInsightId("latest");
    await load();
  }, [load]);

  const refreshAnalysis = useCallback(async () => {
    setRefreshing(true);
    setError("");
    setSyncRows(null);
    try {
      setRefreshStep("Checking connected accounts...");
      let list: Sheet[] = [];
      try {
        list = await api.listSheets();
      } catch {
        list = [];
      }
      if (list.length > 0) {
        const sheetId = selectedSheetId || list[0].id;
        const tab = selectedSheetName || list[0].sheets[0] || "Sales";
        setRefreshStep("Pulling spreadsheet rows...");
        const res = await api.syncSheet(sheetId, tab);
        setSyncRows(res.rows_synced);
      }
      await runAnalysis();
      setToast("Analysis updated.");
    } catch (err) {
      setError("Refresh failed: " + friendlyPipelineError(errorMessage(err)));
    } finally {
      setRefreshing(false);
      setRefreshStep("");
    }
  }, [runAnalysis, selectedSheetId, selectedSheetName]);

  const selectInsight = useCallback(async (id: string) => {
    setSelectedInsightId(id);
    if (id === "latest") {
      const [p, i] = await Promise.allSettled([api.getLatestProfile(), api.getLatestInsights()]);
      if (p.status === "fulfilled") setProfile(p.value);
      if (i.status === "fulfilled") setInsights(i.value.insight_data);
      return;
    }
    try {
      const rec = await api.getInsightById(id);
      setInsights(rec.insight_data);
      if (rec.computed_stats) setProfile(rec.computed_stats);
    } catch (err) {
      setError("Failed to load that snapshot: " + errorMessage(err));
    }
  }, []);

  const reloadGoogle = useCallback(async () => {
    const [g, s] = await Promise.allSettled([api.getGoogleStatus(), api.listSheets()]);
    if (g.status === "fulfilled") setGoogle(g.value);
    setSheets(s.status === "fulfilled" ? s.value : []);
    if (s.status === "fulfilled" && s.value.length > 0) {
      setSelectedSheetId(prev => (s.value.some(x => x.id === prev) ? prev : s.value[0].id));
      setSelectedSheetName(prev => prev || s.value[0].sheets[0] || "");
    }
  }, []);

  const reloadTeam = useCallback(async () => {
    try {
      setTeam(await api.listTeamMembers());
    } catch {
      /* not an admin */
    }
  }, []);

  const signOut = useCallback(() => {
    api.clearToken();
    router.push("/");
  }, [router]);

  const selectSheet = useCallback((id: string) => {
    setSelectedSheetId(id);
    setSelectedSheetName(sheets.find(s => s.id === id)?.sheets[0] || "");
  }, [sheets]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    loading,
    user,
    isAdmin: user?.role === "admin",
    canWrite: user?.role !== "viewer",
    profile,
    insights,
    insightHistory,
    selectedInsightId,
    selectInsight,
    sheets,
    selectedSheetId,
    selectedSheetName,
    selectSheet,
    selectSheetName: setSelectedSheetName,
    slack,
    setSlack,
    google,
    setGoogle,
    reloadGoogle,
    team,
    reloadTeam,
    syncRows,
    hasData: (profile?.summary?.total_transactions ?? 0) > 0,
    lastAnalysedAt: insightHistory[0]?.created_at ?? null,
    refreshing,
    refreshStep,
    refreshAnalysis,
    runAnalysis,
    reload: load,
    updateUser: setUser,
    error,
    setError,
    toast,
    showToast,
    signOut
  }), [loading, user, profile, insights, insightHistory, selectedInsightId, selectInsight, sheets, selectedSheetId,
      selectedSheetName, selectSheet, slack, google, reloadGoogle, team, reloadTeam, syncRows, refreshing, refreshStep, refreshAnalysis,
      runAnalysis, load, error, toast, showToast, signOut]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
