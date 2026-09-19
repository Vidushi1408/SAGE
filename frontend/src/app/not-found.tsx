import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#08080c] flex flex-col justify-center items-center px-4 text-center relative overflow-hidden">
      <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="z-10 space-y-4">
        <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Error 404</p>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">This page could not be found</h1>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">The link may be broken or the page may have moved.</p>
        <div className="flex gap-3 justify-center pt-2">
          <Link href="/" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-semibold transition-all">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>
          <Link href="/dashboard" className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-semibold transition-all">
            Open Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
