import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

export const metadata: Metadata = { title: "Pricing · SAGE", description: "SAGE is free during early access. Here is what you get today and what is still to come." };

const INCLUDED = [
  "Google Sheets and CSV/XLSX import",
  "Automatic analysis: trends, categories, flagged unusual transactions",
  "Plain-English insights with history you can revisit",
  "Ask SAGE: chat with your numbers, including forecasts and \"why did it change\"",
  "Teammates with admin, analyst and viewer roles",
  "Email and Slack alerts for new anomalies",
  "Export your data any time, delete it any time"
];

const PLANNED = ["Single sign-on", "More data connectors", "Multiple locations", "Paid plans (with notice first)"];

const FAQ = [
  ["Is SAGE really free?", "Yes. SAGE is in early access and free to use. There's nothing to pay or enter today, and we'll tell you well before that changes."],
  ["Can SAGE change my spreadsheets?", "No. The Google connection is read-only, and uploaded files are only ever read."],
  ["Who can see my data?", "Only people you invite to your workspace, with roles that control who can sync data and who can only view."],
  ["Can I take my data with me, or delete it?", "Yes. Settings has an Export button (CSV and JSON files) and a Delete account option that removes your workspace for good."],
  ["What if my columns are named differently?", "SAGE recognises common names like Date, Amount, Total and Category, and warns you when something can't be read."]
];

export default function PricingPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-16">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold text-[#3d3335] tracking-tight">Free while we&apos;re in early access</h1>
        <p className="text-[#8a7d78] text-sm max-w-xl mx-auto">Everything below works today and costs nothing. We&apos;re still learning what owners need, so tell us what&apos;s missing.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch max-w-4xl mx-auto">
        <div className="glass-card p-7 flex flex-col gap-5 md:col-span-2 border-[#b9855a]/40 shadow-xl shadow-[#b9855a]/10">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#7f5631] bg-[#f2e9dc] border border-[#ddc2a0] px-2 py-0.5 rounded-full">Early access</span>
            <h2 className="text-lg font-bold text-[#3d3335] mt-2">Everything in SAGE</h2>
            <p className="text-3xl font-bold text-[#3d3335] mt-2">Free</p>
          </div>
          <ul className="space-y-2.5 text-xs text-[#6d6062] flex-1">
            {INCLUDED.map(f => <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0" />{f}</li>)}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className="text-center px-4 py-2.5 rounded-lg text-xs font-bold bg-[#9c6b3f] hover:bg-[#7f5631] text-white transition-all">Create a free account</Link>
            <Link href="/login" className="text-center px-4 py-2.5 rounded-lg text-xs font-bold border border-[#d9cdb8] text-[#6d6062] hover:bg-[#efe8d8] transition-all">Explore the demo</Link>
          </div>
        </div>
        <div className="glass-card p-7 flex flex-col gap-4 bg-[#faf6ec]">
          <h2 className="text-sm font-bold text-[#3d3335]">Not available yet</h2>
          <ul className="space-y-2 text-xs text-[#8a7d78] flex-1">
            {PLANNED.map(f => <li key={f} className="flex gap-2"><span aria-hidden className="w-4 text-center shrink-0">·</span>{f}</li>)}
          </ul>
          <p className="text-[11px] text-[#8a7d78]">These are plans, not promises. Nothing here is switched on.</p>
        </div>
      </div>

      <section aria-labelledby="faq" className="max-w-3xl mx-auto space-y-4">
        <h2 id="faq" className="text-xl font-bold text-[#3d3335] text-center">Frequently asked questions</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="glass-card p-5 group">
            <summary className="cursor-pointer text-sm font-semibold text-[#3d3335] list-none flex justify-between gap-4">{q}<span className="text-[#8a7d78] group-open:rotate-45 transition-transform">+</span></summary>
            <p className="text-xs text-[#8a7d78] mt-3 leading-relaxed">{a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
