import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

export const metadata: Metadata = { title: "Pricing · SAGE", description: "Simple plans for teams of every size. Free while SAGE is in beta." };

const PLANS = [
  { name: "Starter", price: "Free", blurb: "For a single shop or side business.", cta: "Start free", highlight: false,
    features: ["1 workspace, up to 3 teammates", "Google Sheets and CSV/XLSX import", "Weekly and monthly insights", "Email anomaly alerts"] },
  { name: "Growth", price: "Free in beta", blurb: "For growing teams that live in their numbers.", cta: "Get started", highlight: true,
    features: ["Unlimited teammates and roles", "Ask SAGE: chat with your data", "Slack alerts", "Insight history and CSV export", "Priority support"] },
  { name: "Business", price: "Let's talk", blurb: "For multi-location or regulated teams.", cta: "Request access", highlight: false,
    features: ["Everything in Growth", "Single sign-on", "Custom data connectors", "Dedicated onboarding"] }
];

const FAQ = [
  ["Is SAGE really free?", "Yes. Billing isn't switched on yet, so every workspace is free while we're in beta. We'll give you notice before that changes."],
  ["Can SAGE change my spreadsheets?", "No. The Google connection is read-only, and uploaded files are only ever read."],
  ["Who can see my data?", "Only people you invite to your workspace, with roles that control who can sync data and who can only view."],
  ["What if my columns are named differently?", "SAGE recognises common names like Date, Amount, Total and Category, and warns you when something can't be read."]
];

export default function PricingPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-16">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold text-[#3d3335] tracking-tight">Simple, honest pricing</h1>
        <p className="text-[#8a7d78] text-sm max-w-xl mx-auto">Everything is free while SAGE is in beta. Pick the plan that fits how you work; nothing to enter today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {PLANS.map(p => (
          <div key={p.name} className={`glass-card p-7 flex flex-col gap-5 ${p.highlight ? "border-[#b9855a]/40 shadow-xl shadow-[#b9855a]/10" : ""}`}>
            <div>
              {p.highlight && <span className="text-[10px] font-bold uppercase tracking-wider text-[#7f5631] bg-[#f2e9dc] border border-[#ddc2a0] px-2 py-0.5 rounded-full">Most popular</span>}
              <h2 className="text-lg font-bold text-[#3d3335] mt-2">{p.name}</h2>
              <p className="text-3xl font-bold text-[#3d3335] mt-2">{p.price}</p>
              <p className="text-xs text-[#8a7d78] mt-1">{p.blurb}</p>
            </div>
            <ul className="space-y-2.5 text-xs text-[#6d6062] flex-1">
              {p.features.map(f => <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0" />{f}</li>)}
            </ul>
            <Link href="/register" className={`text-center px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${p.highlight ? "bg-[#9c6b3f] hover:bg-[#7f5631] text-white" : "bg-white text-black hover:bg-[#e6ddc9]"}`}>{p.cta}</Link>
          </div>
        ))}
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
