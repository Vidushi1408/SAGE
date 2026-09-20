"use client";

import React, { useState } from "react";
import { Bell, KeyRound, User as UserIcon } from "lucide-react";
import api, { errorMessage } from "../../../lib/api";
import { useWorkspace } from "../../../components/workspace/WorkspaceProvider";
import { Alert, PageHeader, inputClass, labelClass, primaryButton } from "../../../components/ui";

export default function SettingsPage() {
  const { user, updateUser, showToast } = useWorkspace();

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

  return (
    <div className="space-y-8 max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage your profile, notifications and security." />

      <section className="glass-card p-6 space-y-5" aria-labelledby="profile-h">
        <h2 id="profile-h" className="text-base font-bold text-white flex items-center gap-2 border-b border-white/5 pb-3"><UserIcon className="w-4 h-4 text-indigo-400" /> Profile</h2>
        {profileError && <Alert tone="error">{profileError}</Alert>}
        <form onSubmit={saveProfile} className="space-y-4">
          <div><label htmlFor="p-name" className={labelClass}>Full name</label><input id="p-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div><p className="text-gray-500">Email</p><p className="font-semibold text-white mt-0.5 break-all">{user?.email}</p></div>
            <div><p className="text-gray-500">Role</p><p className="font-semibold text-white mt-0.5 capitalize">{user?.role}</p></div>
          </div>
          <button type="submit" disabled={profileBusy || name === (user?.name ?? "")} className={primaryButton}>{profileBusy ? "Saving..." : "Save changes"}</button>
        </form>
      </section>

      <section className="glass-card p-6 space-y-4" aria-labelledby="alerts-h">
        <h2 id="alerts-h" className="text-base font-bold text-white flex items-center gap-2 border-b border-white/5 pb-3"><Bell className="w-4 h-4 text-indigo-400" /> Notifications</h2>
        {alertError && <Alert tone="error">{alertError}</Alert>}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-white">Email me about new anomalies</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Sent after an analysis finds outliers or refunds you haven&apos;t been told about yet.</p>
          </div>
          <button role="switch" aria-checked={alertEmail} aria-label="Email alerts" onClick={toggleAlerts} className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${alertEmail ? "bg-indigo-500" : "bg-white/10"}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${alertEmail ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </section>

      <section className="glass-card p-6 space-y-4" aria-labelledby="pw-h">
        <h2 id="pw-h" className="text-base font-bold text-white flex items-center gap-2 border-b border-white/5 pb-3"><KeyRound className="w-4 h-4 text-indigo-400" /> Password</h2>
        {pwError && <Alert tone="error">{pwError}</Alert>}
        <form onSubmit={changePassword} className="space-y-4">
          <div><label htmlFor="pw-cur" className={labelClass}>Current password</label><input id="pw-cur" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} className={inputClass} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label htmlFor="pw-new" className={labelClass}>New password</label><input id="pw-new" type="password" autoComplete="new-password" minLength={8} required value={next} onChange={e => setNext(e.target.value)} className={inputClass} /></div>
            <div><label htmlFor="pw-conf" className={labelClass}>Confirm new password</label><input id="pw-conf" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} /></div>
          </div>
          <p className="text-[11px] text-gray-600">At least 8 characters. Changing your password signs you out everywhere else.</p>
          <button type="submit" disabled={pwBusy} className={primaryButton}>{pwBusy ? "Updating..." : "Update password"}</button>
        </form>
      </section>

      <section className="glass-card p-6 space-y-2 text-xs text-gray-400" aria-labelledby="ws-h">
        <h2 id="ws-h" className="text-base font-bold text-white border-b border-white/5 pb-3 mb-3">Workspace</h2>
        <p>{user?.workspace_owner_id ? "You're a member of a shared workspace and see the owner's data." : "You own this workspace. Teammates you invite share your data and insights."}</p>
      </section>
    </div>
  );
}
