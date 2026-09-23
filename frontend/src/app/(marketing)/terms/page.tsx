import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms · SAGE", description: "The ground rules for using SAGE." };

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-8 text-sm text-[#8a7d78] leading-relaxed">
      <header>
        <h1 className="text-3xl font-bold text-[#3d3335] tracking-tight">Terms of use</h1>
        <p className="text-xs text-[#6d6062] mt-2">The ground rules for using SAGE, in plain language.</p>
      </header>
      <section className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">Your account</h2>
        <p>Keep your credentials safe and only invite people you trust. You&apos;re responsible for activity in your workspace.</p></section>
      <section className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">Your data</h2>
        <p>You own the data you bring to SAGE. You confirm you have the right to use it, and you grant SAGE permission to process it to provide the service.</p></section>
      <section className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">Insights are guidance</h2>
        <p>SAGE&apos;s insights and recommendations are generated automatically from your data. They can be wrong, so check important decisions against your own records.</p></section>
      <section className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">Acceptable use</h2>
        <p>Don&apos;t attempt to break, overload or gain unauthorised access to the service, and don&apos;t upload data you aren&apos;t allowed to share.</p></section>
      <section className="space-y-2"><h2 className="text-lg font-bold text-[#3d3335]">Beta service</h2>
        <p>SAGE is in beta and provided as is, without warranty. Features may change and we&apos;ll give notice before any pricing begins.</p></section>
    </article>
  );
}
