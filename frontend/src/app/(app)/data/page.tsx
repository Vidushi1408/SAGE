"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, Hash, RefreshCw, Shield, Table2, Upload } from "lucide-react";
import api, { errorMessage } from "../../../lib/api";
import { friendlyPipelineError, useWorkspace } from "../../../components/workspace/WorkspaceProvider";
import { Alert, EmptyState, PageHeader, Skeleton, inputClass, labelClass, primaryButton, secondaryButton, timeAgo } from "../../../components/ui";

function SourceCard({ icon, tone, title, subtitle, badge, children }: {
  icon: React.ReactNode; tone: string; title: string; subtitle: string; badge?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg border ${tone}`}>{icon}</div>
          <div>
            <h2 className="font-bold text-white text-base">{title}</h2>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

export default function DataPage() {
  const ws = useWorkspace();
  const {
    canWrite, isAdmin, sheets, selectedSheetId, selectedSheetName, selectSheet, selectSheetName, refreshAnalysis,
    refreshing, syncRows, runAnalysis, slack, setSlack, google, reloadGoogle
  } = ws;
  const currentSheet = sheets.find(s => s.id === selectedSheetId);

  // Transactions preview
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const loadRows = useCallback(async () => {
    try {
      const res = await api.getTransactions();
      setRows(res.data);
      setTotal(res.count);
    } catch {
      setRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
  useEffect(() => { loadRows(); }, [loadRows]);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadOk, setUploadOk] = useState("");
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadError(""); setUploadOk(""); setUploadWarnings([]);
    setUploading(true);
    let imported = 0;
    try {
      const res = await api.uploadFile(file);
      imported = res.rows_synced;
      setUploadWarnings(res.warnings || []);
      await runAnalysis();
      await loadRows();
      setUploadOk(`Imported ${res.rows_synced} rows from ${file.name} and updated your analysis.`);
    } catch (err) {
      setUploadError(imported > 0
        ? `Imported ${imported} rows, but the analysis failed: ${friendlyPipelineError(errorMessage(err))}`
        : errorMessage(err) || "Failed to upload file.");
    } finally {
      setUploading(false);
    }
  };

  // Google
  const connectGoogle = async () => {
    try {
      const res = await api.getGoogleLoginUrl();
      window.location.href = res.url;
    } catch (err) {
      ws.setError("Failed to start Google connection: " + errorMessage(err));
    }
  };
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const disconnectGoogle = async () => {
    if (!confirm("Disconnect Google? The rows imported from your spreadsheets will be removed from SAGE (your sheets are untouched).")) return;
    setGoogleBusy(true);
    try {
      await api.disconnectGoogle();
      await reloadGoogle();
      await runAnalysisSafe();
      await loadRows();
      ws.showToast("Google disconnected.");
    } catch (err) {
      setGoogleError(errorMessage(err) || "Failed to disconnect.");
    } finally { setGoogleBusy(false); }
  };
  // Re-analyse so the dashboard reflects the removed rows; harmless if nothing is left to analyse.
  const runAnalysisSafe = async () => { try { await runAnalysis(); } catch { /* no data left */ } };

  const [link, setLink] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const addByLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoogleError(""); setLinkBusy(true);
    try {
      const found = await api.lookupSheet(link);
      setLink("");
      await reloadGoogle();
      selectSheet(found.id);
      selectSheetName(found.sheets[0] || "");
      ws.showToast(`Added "${found.name}".`);
    } catch (err) {
      setGoogleError(errorMessage(err));
    } finally { setLinkBusy(false); }
  };

  const syncNow = async () => { await refreshAnalysis(); await loadRows(); };

  // Slack
  const [webhook, setWebhook] = useState("");
  const [slackBusy, setSlackBusy] = useState(false);
  const [slackError, setSlackError] = useState("");
  const connectSlack = async (e: React.FormEvent) => {
    e.preventDefault();
    setSlackError(""); setSlackBusy(true);
    try {
      await api.connectSlack(webhook);
      setSlack(await api.getSlackStatus());
      setWebhook("");
    } catch (err) {
      setSlackError(errorMessage(err) || "Failed to connect Slack.");
    } finally { setSlackBusy(false); }
  };
  const disconnectSlack = async () => {
    setSlackBusy(true);
    try { await api.disconnectSlack(); setSlack({ connected: false }); }
    catch (err) { setSlackError(errorMessage(err) || "Failed to disconnect Slack."); }
    finally { setSlackBusy(false); }
  };

  const columns = useMemo(() => {
    const seen = new Set<string>();
    rows.slice(0, 20).forEach(r => Object.keys(r).forEach(k => seen.add(k)));
    return [...seen].slice(0, 8);
  }, [rows]);
  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? rows.filter(r => JSON.stringify(r).toLowerCase().includes(q)) : rows;
  }, [rows, filter]);

  return (
    <div className="space-y-8">
      <PageHeader title="Data" subtitle="Where SAGE gets its numbers. Connect a source, and every analysis is built from it." />

      {!canWrite && (
        <Alert tone="warning"><span className="flex items-center gap-2"><Shield className="w-4 h-4" /> You have read-only access. Ask a workspace admin for analyst access to sync data or upload files.</span></Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <SourceCard
          icon={<Database className="w-5 h-5" />} tone="bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          title="Google Sheets" subtitle={google.connected ? `Connected as ${google.email ?? "your Google account"}` : "Live-sync a spreadsheet of your sales"}
          badge={canWrite && (google.connected ? (
            <div className="flex gap-2">
              <button onClick={connectGoogle} className={secondaryButton}>Reconnect</button>
              <button onClick={disconnectGoogle} disabled={googleBusy} className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold">Disconnect</button>
            </div>
          ) : (
            <button onClick={connectGoogle} className={primaryButton}>Connect Google</button>
          ))}
        >
          {google.connected && google.is_mock && (
            <Alert tone="warning">Demo mode: Google sign-in isn&apos;t set up on this server, so SAGE is using sample data. See GOOGLE_SETUP.md to connect real accounts.</Alert>
          )}
          {!google.connected && (
            <p className="text-xs text-gray-500 leading-relaxed">
              Sign in with Google and choose a spreadsheet. SAGE only ever <strong className="text-gray-300">reads</strong> your sheets; it can never edit or delete them, and you can disconnect at any time.
            </p>
          )}

          {google.connected && (
            <div className="space-y-4">
              {sheets.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="sheet" className={labelClass}>Spreadsheet</label>
                    <select id="sheet" value={selectedSheetId} onChange={e => selectSheet(e.target.value)} className={inputClass}>
                      {sheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="tab" className={labelClass}>Worksheet</label>
                    <select id="tab" value={selectedSheetName} onChange={e => selectSheetName(e.target.value)} className={inputClass}>
                      {currentSheet?.sheets.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {canWrite && (
                    <button onClick={syncNow} disabled={refreshing} className={`${primaryButton} sm:col-span-2`}>
                      <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Sync &amp; analyse
                    </button>
                  )}
                </div>
              ) : (
                <p className="p-5 text-center text-gray-500 text-xs border border-dashed border-white/10 rounded-xl">
                  No spreadsheets found in this Google account yet. {!google.is_mock && "Paste a link to one below."}
                </p>
              )}

              {syncRows !== null && <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> {syncRows} rows imported.</p>}
              {google.last_synced_at && <p className="text-[11px] text-gray-500">Last synced {timeAgo(google.last_synced_at)}{google.rows_synced != null ? ` · ${google.rows_synced} rows` : ""}{google.sheet_name ? ` · ${google.sheet_name}` : ""}</p>}
              {googleError && <Alert tone="error">{googleError}</Alert>}

              {canWrite && !google.is_mock && (
                <form onSubmit={addByLink} className="pt-2 border-t border-white/5 space-y-2">
                  <label htmlFor="sheet-link" className={labelClass}>Or add a spreadsheet by link</label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input id="sheet-link" value={link} onChange={e => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className={inputClass} />
                    <button type="submit" disabled={linkBusy || !link.trim()} className={`${secondaryButton} whitespace-nowrap`}>{linkBusy ? "Checking..." : "Add sheet"}</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </SourceCard>

        {canWrite && (
          <SourceCard icon={<Upload className="w-5 h-5" />} tone="bg-indigo-500/10 border-indigo-500/20 text-indigo-400" title="Upload a file" subtitle="Import a CSV or XLSX export (max 5MB)">
            {uploadOk && <Alert tone="success">{uploadOk}</Alert>}
            {uploadError && <Alert tone="error">{uploadError}</Alert>}
            {uploadWarnings.length > 0 && <Alert tone="warning">{uploadWarnings.map((w, i) => <p key={i}>{w}</p>)}</Alert>}
            <label className="flex items-center justify-center gap-2 w-full py-8 rounded-xl border border-dashed border-white/10 hover:border-indigo-500/40 hover:bg-white/5 cursor-pointer transition-all text-xs text-gray-400 focus-within:border-indigo-500">
              {uploading ? <><RefreshCw className="w-4 h-4 animate-spin text-indigo-400" /> Uploading and analysing...</> : <><Upload className="w-4 h-4" /> Choose a .csv or .xlsx file</>}
              <input type="file" accept=".csv,.xlsx" className="sr-only" disabled={uploading} onChange={onUpload} />
            </label>
            <p className="text-[11px] text-gray-600">SAGE recognises common column names (Date, Amount, Category, Quantity) and formats like $1,200.50 or 1.234,50.</p>
          </SourceCard>
        )}

        <SourceCard
          icon={<Hash className="w-5 h-5" />} tone="bg-violet-500/10 border-violet-500/20 text-violet-400"
          title="Slack alerts" subtitle="Post anomalies and insights to a channel"
          badge={slack.connected && <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full font-bold border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Connected</span>}
        >
          {slackError && <Alert tone="error">{slackError}</Alert>}
          {!isAdmin ? (
            <p className="text-xs text-gray-500">Only workspace administrators can manage Slack alerts.</p>
          ) : slack.connected ? (
            <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
              <span className="font-mono truncate">{slack.webhook_url}</span>
              <button onClick={disconnectSlack} disabled={slackBusy} className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 font-semibold shrink-0">Disconnect</button>
            </div>
          ) : (
            <form onSubmit={connectSlack} className="flex flex-col sm:flex-row gap-3">
              <label htmlFor="webhook" className="sr-only">Slack webhook URL</label>
              <input id="webhook" type="url" required value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="https://hooks.slack.com/services/..." className={inputClass} />
              <button type="submit" disabled={slackBusy} className={`${primaryButton} whitespace-nowrap`}>{slackBusy ? "Connecting..." : "Connect"}</button>
            </form>
          )}
        </SourceCard>
      </div>

      <section className="glass-card p-6 space-y-4" aria-labelledby="tx-heading">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
          <div>
            <h2 id="tx-heading" className="font-bold text-white text-base flex items-center gap-2"><Table2 className="w-4 h-4 text-gray-500" /> Imported transactions</h2>
            <p className="text-xs text-gray-500">{total > rows.length ? `Showing the first ${rows.length} of ${total} rows` : `${total} rows`}</p>
          </div>
          <input aria-label="Filter transactions" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter rows" className={`${inputClass} sm:w-56`} />
        </div>
        {rowsLoading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-8" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Table2 className="w-5 h-5" />} title="No data imported yet" body="Connect Google Sheets or upload a file above and your rows will show up here." />
        ) : (
          <div className="overflow-x-auto max-h-[28rem]">
            <table className="w-full text-left text-xs text-gray-400">
              <thead className="sticky top-0 bg-[#0c0c12]">
                <tr className="border-b border-white/5 text-gray-500 font-semibold">{columns.map(c => <th key={c} className="py-2.5 pr-4 whitespace-nowrap">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRows.map((r, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">{columns.map(c => <td key={c} className="py-2.5 pr-4 whitespace-nowrap">{String(r[c] ?? "")}</td>)}</tr>
                ))}
                {filteredRows.length === 0 && <tr><td colSpan={columns.length} className="py-6 text-center text-gray-600">No rows match your filter.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
