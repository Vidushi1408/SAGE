import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms · SAGE", description: "The ground rules for using SAGE." };

// Plain-language starter terms for an early-access product. Have them reviewed before onboarding real customers.
const SECTIONS: [string, string][] = [
  ["Your account", "Keep your credentials safe and only invite people you trust. You're responsible for activity in your workspace, and for the roles you give teammates."],
  ["Your data", "You own the data you bring to SAGE. You confirm you have the right to use it, and you give SAGE permission to process it to provide the service, including generating insights and answers from it. You can export or delete it at any time from Settings."],
  ["Insights are guidance", "SAGE's insights, forecasts and answers are generated automatically from your data. Forecasts are rough projections, and answers describe patterns in your data, not proven causes. They can be wrong or incomplete, so check important decisions against your own records."],
  ["The demo workspace", "The demo is a read-only sandbox with sample data. Don't expect anything you do there to be saved, and don't enter real business information."],
  ["Acceptable use", "Don't try to break, overload or gain unauthorised access to the service, and don't upload data you aren't allowed to share."],
  ["Early access", "SAGE is in early access and provided as is, without warranty or any promise of uninterrupted service. Features may change or be withdrawn. It's free for now, and we'll give you notice before any pricing begins."],
  ["Ending things", "You can delete your account whenever you like. We may suspend accounts that break these terms or put the service or other users at risk."],
];

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-8 text-sm text-[#8a7d78] leading-relaxed">
      <header>
        <h1 className="text-3xl font-bold text-[#3d3335] tracking-tight">Terms of use</h1>
        <p className="text-xs text-[#6d6062] mt-2">The ground rules for using SAGE, in plain language.</p>
      </header>
      {SECTIONS.map(([title, body]) => (
        <section key={title} className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">{title}</h2><p>{body}</p></section>
      ))}
    </article>
  );
}
