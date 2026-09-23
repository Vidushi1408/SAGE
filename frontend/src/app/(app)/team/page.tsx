"use client";

import React, { useState } from "react";
import { CheckCircle2, RefreshCw, Shield, Trash2, UserPlus } from "lucide-react";
import api, { errorMessage } from "../../../lib/api";
import { useWorkspace } from "../../../components/workspace/WorkspaceProvider";
import { Alert, PageHeader, parseServerDate, inputClass, labelClass, primaryButton } from "../../../components/ui";

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-[#f2e9dc] border-[#ead9c2] text-[#9c6b3f]",
  analyst: "bg-[#f2e9dc] border-[#f2e9dc] text-[#7d6864]",
  viewer: "bg-[#efe8d8] border-[#e6ddc9] text-[#6d6062]"
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
          <table className="w-full text-left text-xs text-[#8a7d78]">
            <thead>
              <tr className="border-b border-[#efe8d8] text-[#8a7d78] font-semibold">
                <th className="py-2.5">Name</th><th className="py-2.5">Email</th><th className="py-2.5">Role</th>
                <th className="py-2.5">Status</th><th className="py-2.5">Added</th>{isAdmin && <th className="py-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#efe8d8]">
              {team.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-[#6d6062]">{isAdmin ? "It's just you so far. Invite a teammate below." : "The team list is visible to workspace admins."}</td></tr>
              )}
              {team.map(m => (
                <tr key={m.id} className="hover:bg-[#f6f1e7]">
                  <td className="py-3 font-semibold text-[#3d3335]">{m.name || "N/A"}{m.id === user?.id && <span className="ml-2 text-[10px] text-[#8a7d78]">(you)</span>}</td>
                  <td className="py-3 font-mono">{m.email}</td>
                  <td className="py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border capitalize ${ROLE_STYLES[m.role] ?? ROLE_STYLES.viewer}`}>{m.role}</span></td>
                  <td className="py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${m.is_active ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-amber-50 border-amber-100 text-amber-700"}`}>{m.is_active ? "Active" : "Pending"}</span>
                  </td>
                  <td className="py-3 text-[#8a7d78]">{parseServerDate(m.created_at).toLocaleDateString()}</td>
                  {isAdmin && (
                    <td className="py-3 text-right whitespace-nowrap">
                      {!m.is_active && <button onClick={() => resend(m.id, m.email)} className="px-2 py-1 mr-1 text-[10px] font-semibold text-[#9c6b3f] hover:text-[#66431f] hover:bg-[#f2e9dc] rounded" title="Send a fresh invite link">Resend</button>}
                      {m.role !== "admin" && <button onClick={() => remove(m.id, m.name || m.email)} aria-label={`Remove ${m.email}`} className="p-1 text-[#a89b93] hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>}
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
          <h2 className="text-base font-bold text-[#3d3335] mb-1 flex items-center gap-2"><UserPlus className="w-4 h-4 text-[#9c6b3f]" /> Invite a teammate</h2>
          <p className="text-xs text-[#8a7d78] mb-6">They&apos;ll get an email to set their own password and will share this workspace&apos;s data and insights.</p>
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
