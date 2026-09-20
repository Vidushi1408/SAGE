"use client";

import React, { useState } from "react";
import { CheckCircle2, RefreshCw, Shield, Trash2, UserPlus } from "lucide-react";
import api, { errorMessage } from "../../../lib/api";
import { useWorkspace } from "../../../components/workspace/WorkspaceProvider";
import { Alert, PageHeader, parseServerDate, inputClass, labelClass, primaryButton } from "../../../components/ui";

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
  analyst: "bg-purple-500/10 border-purple-500/20 text-purple-400",
  viewer: "bg-zinc-500/10 border-zinc-500/20 text-zinc-400"
};

export default function TeamPage() {
  const { isAdmin, team, reloadTeam, user, showToast, setError } = useWorkspace();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("analyst");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [formError, setFormError] = useState("");

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(""); setOk(""); setBusy(true);
    try {
      const m = await api.inviteTeamMember({ email, name: name || undefined, role });
      setOk(`Invite email sent to ${m.email}. They'll show as "Pending" until they accept.`);
      setEmail(""); setName(""); setRole("analyst");
      await reloadTeam();
    } catch (err) {
      setFormError(errorMessage(err) || "Invitation failed.");
    } finally { setBusy(false); }
  };

  const resend = async (id: string, to: string) => {
    try { await api.resendInvite(id); showToast(`A fresh invite link was sent to ${to}.`); }
    catch (err) { setError("Failed to resend invite: " + errorMessage(err)); }
  };

  const remove = async (id: string, label: string) => {
    if (!confirm(`Remove ${label} from the workspace?`)) return;
    try { await api.deleteTeamMember(id); await reloadTeam(); showToast(`${label} was removed.`); }
    catch (err) { setError("Failed to remove team member: " + errorMessage(err)); }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Team" subtitle="Everyone here sees the same data and insights, with access matched to their role." />

      <section className="glass-card p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-400">
            <thead>
              <tr className="border-b border-white/5 text-gray-500 font-semibold">
                <th className="py-2.5">Name</th><th className="py-2.5">Email</th><th className="py-2.5">Role</th>
                <th className="py-2.5">Status</th><th className="py-2.5">Added</th>{isAdmin && <th className="py-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {team.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-600">{isAdmin ? "It's just you so far. Invite a teammate below." : "The team list is visible to workspace admins."}</td></tr>
              )}
              {team.map(m => (
                <tr key={m.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 font-semibold text-white">{m.name || "N/A"}{m.id === user?.id && <span className="ml-2 text-[10px] text-gray-500">(you)</span>}</td>
                  <td className="py-3 font-mono">{m.email}</td>
                  <td className="py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border capitalize ${ROLE_STYLES[m.role] ?? ROLE_STYLES.viewer}`}>{m.role}</span></td>
                  <td className="py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${m.is_active ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>{m.is_active ? "Active" : "Pending"}</span>
                  </td>
                  <td className="py-3 text-gray-500">{parseServerDate(m.created_at).toLocaleDateString()}</td>
                  {isAdmin && (
                    <td className="py-3 text-right whitespace-nowrap">
                      {!m.is_active && <button onClick={() => resend(m.id, m.email)} className="px-2 py-1 mr-1 text-[10px] font-semibold text-indigo-300 hover:text-white hover:bg-indigo-500/10 rounded" title="Send a fresh invite link">Resend</button>}
                      {m.role !== "admin" && <button onClick={() => remove(m.id, m.name || m.email)} aria-label={`Remove ${m.email}`} className="p-1 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin ? (
        <section className="glass-card p-6">
          <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2"><UserPlus className="w-4 h-4 text-indigo-400" /> Invite a teammate</h2>
          <p className="text-xs text-gray-500 mb-6">They&apos;ll get an email to set their own password and will share this workspace&apos;s data and insights.</p>
          {ok && <div className="mb-4"><Alert tone="success"><span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {ok}</span></Alert></div>}
          {formError && <div className="mb-4"><Alert tone="error">{formError}</Alert></div>}
          <form onSubmit={invite} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div><label htmlFor="inv-name" className={labelClass}>Name</label><input id="inv-name" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" className={inputClass} /></div>
            <div><label htmlFor="inv-email" className={labelClass}>Email</label><input id="inv-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@business.com" className={inputClass} /></div>
            <div>
              <label htmlFor="inv-role" className={labelClass}>Role</label>
              <select id="inv-role" value={role} onChange={e => setRole(e.target.value)} className={inputClass}>
                <option value="analyst">Analyst: sync, refresh, chat</option>
                <option value="viewer">Viewer: read-only</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <button type="submit" disabled={busy} className={primaryButton}>{busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Send invite</button>
            </div>
          </form>
        </section>
      ) : (
        <Alert tone="warning"><span className="flex items-center gap-2"><Shield className="w-4 h-4" /> Only workspace admins can invite or remove teammates.</span></Alert>
      )}
    </div>
  );
}
