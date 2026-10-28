"use client";

import React, { useState } from "react";
import { Bell, Database, KeyRound, Trash2, User as UserIcon } from "lucide-react";
import api, { errorMessage } from "../../../lib/api";
import { useWorkspace } from "../../../components/workspace/WorkspaceProvider";
import { saveBlob } from "../../../lib/download";
import { Alert, PageHeader, inputClass, labelClass, primaryButton } from "../../../components/ui";

export default function SettingsPage() {
  const { user, updateUser, showToast, signOut } = useWorkspace();

  // Profile
  const [name, setName] = useState(user?.name ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(""); setProfileBusy(true);
    try {
      updateUser(await api.updateMe({ name }));
      showToast("Profile updated.");
    } catch (err) { setProfileError(errorMessage(err)); }
    finally { setProfileBusy(false); }
  };

  // Alerts
  const [alertEmail, setAlertEmail] = useState(user?.alert_email_enabled !== false);
  const [alertError, setAlertError] = useState("");
  const toggleAlerts = async () => {
    const next = !alertEmail;
    setAlertEmail(next); setAlertError("");
    try { updateUser(await api.updateMe({ alert_email_enabled: next })); }
    catch (err) { setAlertEmail(!next); setAlertError("Couldn't save that preference: " + errorMessage(err)); }
  };

  // Password
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (next !== confirm) { setPwError("The new passwords don't match."); return; }
    setPwBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      showToast("Password changed. Other devices have been signed out.");
    } catch (err) { setPwError(errorMessage(err)); }
    finally { setPwBusy(false); }
  };

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportData = async () => {
    setExportError(""); setExporting(true);
    try {
      saveBlob(await api.exportData(), "sage-export.zip");
      showToast("Your export is downloading.");
    } catch (err) { setExportError(errorMessage(err)); }
    finally { setExporting(false); }
  };

  // Delete account
  const isOwner = !user?.workspace_owner_id;
  const [delPassword, setDelPassword] = useState("");
  const [delSure, setDelSure] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState("");
  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDelError(""); setDelBusy(true);
    try {
      await api.deleteAccount(delPassword);
      signOut();
    } catch (err) { setDelError(errorMessage(err)); setDelBusy(false); }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage your profile, notifications and security." />

      <section className="glass-card p-6 space-y-5" aria-labelledby="profile-h">
        <h2 id="profile-h" className="text-base font-bold text-[#3d3335] flex items-center gap-2 border-b border-[#efe8d8] pb-3"><UserIcon className="w-4 h-4 text-[#9c6b3f]" /> Profile</h2>
        {profileError && <Alert tone="error">{profileError}</Alert>}
        <form onSubmit={saveProfile} className="space-y-4">
          <div><label htmlFor="p-name" className={labelClass}>Full name</label><input id="p-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div><p className="text-[#8a7d78]">Email</p><p className="font-semibold text-[#3d3335] mt-0.5 break-all">{user?.email}</p></div>
            <div><p className="text-[#8a7d78]">Role</p><p className="font-semibold text-[#3d3335] mt-0.5 capitalize">{user?.role}</p></div>
          </div>
          <button type="submit" disabled={profileBusy || name === (user?.name ?? "")} className={primaryButton}>{profileBusy ? "Saving..." : "Save changes"}</button>
        </form>
      </section>

      <section className="glass-card p-6 space-y-4" aria-labelledby="alerts-h">
        <h2 id="alerts-h" className="text-base font-bold text-[#3d3335] flex items-center gap-2 border-b border-[#efe8d8] pb-3"><Bell className="w-4 h-4 text-[#9c6b3f]" /> Notifications</h2>
        {alertError && <Alert tone="error">{alertError}</Alert>}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#3d3335]">Email me about new anomalies</p>
            <p className="text-[11px] text-[#8a7d78] mt-0.5">Sent after an analysis finds outliers or refunds you haven&apos;t been told about yet.</p>
          </div>
          <button role="switch" aria-checked={alertEmail} aria-label="Email alerts" onClick={toggleAlerts} className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${alertEmail ? "bg-[#9c6b3f]" : "bg-[#e6ddc9]"}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${alertEmail ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </section>

      <section className="glass-card p-6 space-y-4" aria-labelledby="pw-h">
        <h2 id="pw-h" className="text-base font-bold text-[#3d3335] flex items-center gap-2 border-b border-[#efe8d8] pb-3"><KeyRound className="w-4 h-4 text-[#9c6b3f]" /> Password</h2>
        {pwError && <Alert tone="error">{pwError}</Alert>}
        <form onSubmit={changePassword} className="space-y-4">
          <div><label htmlFor="pw-cur" className={labelClass}>Current password</label><input id="pw-cur" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} className={inputClass} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label htmlFor="pw-new" className={labelClass}>New password</label><input id="pw-new" type="password" autoComplete="new-password" minLength={8} required value={next} onChange={e => setNext(e.target.value)} className={inputClass} /></div>
            <div><label htmlFor="pw-conf" className={labelClass}>Confirm new password</label><input id="pw-conf" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} /></div>
          </div>
          <p className="text-[11px] text-[#6d6062]">At least 8 characters. Changing your password signs you out everywhere else.</p>
          <button type="submit" disabled={pwBusy} className={primaryButton}>{pwBusy ? "Updating..." : "Update password"}</button>
        </form>
      </section>

      {!user?.is_demo && (
        <>
          <section className="glass-card p-6 space-y-4" aria-labelledby="export-h">
            <h2 id="export-h" className="text-base font-bold text-[#3d3335] flex items-center gap-2 border-b border-[#efe8d8] pb-3"><Database className="w-4 h-4 text-[#9c6b3f]" /> Your data</h2>
            {exportError && <Alert tone="error">{exportError}</Alert>}
            <p className="text-xs text-[#8a7d78] leading-relaxed">Download everything SAGE holds for this workspace as a ZIP of CSV and JSON files: your transactions, statistics, insights and your own chat history. Passwords, tokens and webhook links are never included.</p>
            <button onClick={exportData} disabled={exporting} className={primaryButton}>{exporting ? "Preparing..." : "Export my data"}</button>
          </section>

          <section className="glass-card p-6 space-y-4 border-rose-200" aria-labelledby="danger-h">
            <h2 id="danger-h" className="text-base font-bold text-rose-700 flex items-center gap-2 border-b border-rose-100 pb-3"><Trash2 className="w-4 h-4" /> Delete account</h2>
            {delError && <Alert tone="error">{delError}</Alert>}
            <p className="text-xs text-[#6d6062] leading-relaxed">
              {isOwner
                ? "This permanently deletes your workspace: all imported data, insights and chat history, your connections (Google access is revoked), and every teammate's account. It can't be undone, so export your data first if you want a copy."
                : "This permanently deletes your own account and chat history. The workspace and its data stay with the owner."}
            </p>
            <form onSubmit={deleteAccount} className="space-y-4">
              <div><label htmlFor="del-pw" className={labelClass}>Confirm your password</label><input id="del-pw" type="password" autoComplete="current-password" required value={delPassword} onChange={e => setDelPassword(e.target.value)} className={inputClass} /></div>
              <label className="flex items-start gap-2 text-xs text-[#6d6062]">
                <input type="checkbox" checked={delSure} onChange={e => setDelSure(e.target.checked)} className="mt-0.5" />
                <span>I understand this is permanent and can&apos;t be undone.</span>
              </label>
              <button type="submit" disabled={delBusy || !delSure || !delPassword} className="px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-xs font-semibold transition-colors">{delBusy ? "Deleting..." : isOwner ? "Delete my workspace and account" : "Delete my account"}</button>
            </form>
          </section>
        </>
      )}

      <section className="glass-card p-6 space-y-2 text-xs text-[#8a7d78]" aria-labelledby="ws-h">
        <h2 id="ws-h" className="text-base font-bold text-[#3d3335] border-b border-[#efe8d8] pb-3 mb-3">Workspace</h2>
        <p>{user?.workspace_owner_id ? "You're a member of a shared workspace and see the owner's data." : "You own this workspace. Teammates you invite share your data and insights."}</p>
      </section>
    </div>
  );
}
