import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · SAGE", description: "What SAGE collects, how it is used, and the choices you have." };

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-8 text-sm text-[#8a7d78] leading-relaxed">
      <header>
        <h1 className="text-3xl font-bold text-[#3d3335] tracking-tight">Privacy</h1>
        <p className="text-xs text-[#6d6062] mt-2">Plain-language summary of how SAGE handles your data.</p>
      </header>
      <section className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">What we collect</h2>
        <p>Your account details (email, name, hashed password), the business data you connect or upload (rows from Google Sheets or CSV/XLSX files), and the statistics and insights SAGE computes from it. Passwords are stored only as salted hashes.</p></section>
      <section className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">How we use it</h2>
        <p>Solely to show you your analytics, answer your questions in Ask SAGE, and send the alerts you enable. We don&apos;t sell your data or use it for advertising.</p></section>
      <section className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">AI processing</h2>
        <p>Insights and chat answers are produced from computed summary statistics rather than raw rows. Depending on how your workspace is deployed, this runs on a locally hosted model or a third-party AI provider.</p></section>
      <section className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">Google access</h2>
        <p>The Google Sheets connection is read-only. SAGE never edits or deletes your spreadsheets, and you can revoke access at any time from your Google account.</p></section>
      <section className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">Who can see your data</h2>
        <p>Only members of your workspace, according to their role. Each person&apos;s chat history is private to them.</p></section>
      <section className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">Your choices</h2>
        <p>You can change your password, turn off email alerts, disconnect Slack, and ask a workspace admin to remove teammates at any time. To delete your account and data, contact us.</p></section>
    </article>
  );
}
