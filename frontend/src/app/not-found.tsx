import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#f6f1e7] flex flex-col justify-center items-center px-4 text-center relative overflow-hidden">
      <div className="z-10 space-y-4">
        <p className="text-xs font-bold text-[#9c6b3f] uppercase tracking-widest">Error 404</p>
        <h1 className="text-3xl font-bold text-[#3d3335] tracking-tight">This page could not be found</h1>
        <p className="text-sm text-[#8a7d78] max-w-sm mx-auto">The link may be broken or the page may have moved.</p>
        <div className="flex gap-3 justify-center pt-2">
          <Link href="/" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#efe8d8] border border-[#e6ddc9] hover:bg-[#f6f1e7] text-[#3d3335] text-xs font-semibold transition-all">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>
          <Link href="/dashboard" className="px-4 py-2.5 rounded-lg bg-[#9c6b3f] hover:bg-[#7f5631] text-white text-xs font-semibold transition-all">
            Open Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
