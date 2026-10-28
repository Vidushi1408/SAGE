import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · SAGE", description: "What SAGE collects, how it is used, who else sees it, and the choices you have." };

// Written from how the app actually behaves today. Have it reviewed (and add a contact address) before onboarding real customers.
const SECTIONS: [string, React.ReactNode][] = [
  ["What we collect", <>
    <p>Your account details (email, name, and a salted bcrypt hash of your password, never the password itself). The business data you bring: rows from a Google Sheet you connect, or from a CSV/XLSX file you upload. What SAGE works out from them: totals, trends, category breakdowns, flagged unusual transactions, and the written insights. Your chat messages with SAGE and its replies. A Slack webhook link, if you add one.</p>
  </>],
  ["What we don't collect", <>
    <p>No advertising or analytics trackers. The only thing stored in your browser is a sign-in token, which is removed when you sign out.</p>
  </>],
  ["How we use it", <>
    <p>Only to show you your analytics, answer your questions in Ask SAGE, and send the alerts you switch on. We don&apos;t sell your data and don&apos;t use it for advertising.</p>
  </>],
  ["AI processing", <>
    <p>Insights and chat answers are written from computed summary statistics and not from your raw rows. Those statistics include details of any flagged unusual transactions (their date, amount and ID), your question, and the figures SAGE looks up to answer it. Depending on how SAGE is set up, this is processed by a model running on our own servers or sent to a third-party AI provider (Anthropic) for that request. SAGE checks every figure in an answer against your data before showing it.</p>
  </>],
  ["Other services that receive data", <>
    <p><strong>Google:</strong> the connection is read-only, SAGE never edits or deletes your spreadsheets, and you can disconnect at any time (that also revokes our access at Google and removes the imported rows). <strong>Email:</strong> alert, invite and password-reset emails are sent through an email delivery provider and include your address and the message content. <strong>Slack:</strong> if you add a webhook, alert summaries are posted to that channel.</p>
  </>],
  ["How it's protected", <>
    <p>Google access tokens are stored encrypted. Passwords are hashed. Sign-in attempts are rate limited, and changing your password signs out your other sessions. Slack webhook links are visible only to workspace admins. No system is perfectly secure, so if you find a problem, please tell us.</p>
  </>],
  ["Who can see your data", <>
    <p>Only members of your workspace, according to their role (admin, analyst or viewer). Each person&apos;s chat history is private to them. The public demo workspace contains sample data only, not anyone&apos;s real business data.</p>
  </>],
  ["Keeping and deleting it", <>
    <p>We keep your data while your account exists. <strong>Settings → Your data</strong> downloads everything we hold for your workspace as CSV and JSON files. <strong>Settings → Delete account</strong> permanently removes your account; if you own the workspace, that includes all its data, insights, chats, connections and teammates&apos; accounts. Disconnecting a source removes the rows imported from it. Copies held in infrastructure backups age out on our hosting provider&apos;s schedule. Older analyses are trimmed automatically, keeping the most recent 100.</p>
  </>],
];

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-8 text-sm text-[#8a7d78] leading-relaxed">
      <header>
        <h1 className="text-3xl font-bold text-[#3d3335] tracking-tight">Privacy</h1>
        <p className="text-xs text-[#6d6062] mt-2">A plain-language account of how SAGE handles your data. SAGE is in early access, and we&apos;ll update this page, and tell you, if that changes.</p>
      </header>
      {SECTIONS.map(([title, body]) => (
        <section key={title} className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">{title}</h2>{body}</section>
      ))}
    </article>
  );
}
