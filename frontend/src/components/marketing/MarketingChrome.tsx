"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles, X } from "lucide-react";
import api from "../../lib/api";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#workflow", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" }
];

export function MarketingHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable on the client
  useEffect(() => { setSignedIn(api.isLoggedIn()); }, []);

  return (
    <header className="border-b border-white/5 bg-[#08080c]/70 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></span>
          <span className="text-lg font-extrabold text-white tracking-tight">SAGE</span>
        </Link>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-8 text-xs font-semibold text-gray-400">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined} className={`hover:text-white transition-colors ${pathname === l.href ? "text-white" : ""}`}>{l.label}</Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          {signedIn ? (
            <Link href="/dashboard" className="px-4 py-2 text-xs font-bold bg-white text-black hover:bg-gray-200 rounded-lg transition-all">Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="text-xs font-semibold text-gray-400 hover:text-white transition-colors">Sign in</Link>
              <Link href="/register" className="px-4 py-2 text-xs font-bold bg-white text-black hover:bg-gray-200 rounded-lg transition-all">Get started</Link>
            </>
          )}
        </div>

        <button className="md:hidden p-2 text-gray-400 hover:text-white" onClick={() => setOpen(o => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <nav aria-label="Mobile" className="md:hidden border-t border-white/5 px-4 py-4 flex flex-col gap-1 text-sm">
          {LINKS.map(l => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="px-3 py-2.5 rounded-lg text-gray-300 hover:bg-white/5">{l.label}</Link>)}
          <div className="pt-3 flex gap-3">
            {signedIn ? (
              <Link href="/dashboard" className="flex-1 text-center px-4 py-2.5 text-xs font-bold bg-white text-black rounded-lg">Open dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="flex-1 text-center px-4 py-2.5 text-xs font-semibold border border-white/10 rounded-lg text-gray-200">Sign in</Link>
                <Link href="/register" className="flex-1 text-center px-4 py-2.5 text-xs font-bold bg-white text-black rounded-lg">Get started</Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

export function MarketingFooter() {
  const col = "space-y-2.5 text-xs";
  const link = "block text-gray-500 hover:text-white transition-colors";
  return (
    <footer className="border-t border-white/5 bg-black/20 mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1 space-y-2">
          <p className="text-sm font-extrabold text-white">SAGE</p>
          <p className="text-xs text-gray-500 leading-relaxed">Smart Analytics &amp; Growth Engine. An analyst that never clocks out.</p>
        </div>
        <div className={col}><p className="font-bold text-gray-300">Product</p>
          <Link className={link} href="/#features">Features</Link><Link className={link} href="/#workflow">How it works</Link><Link className={link} href="/pricing">Pricing</Link>
        </div>
        <div className={col}><p className="font-bold text-gray-300">Account</p>
          <Link className={link} href="/login">Sign in</Link><Link className={link} href="/register">Create workspace</Link><Link className={link} href="/forgot-password">Reset password</Link>
        </div>
        <div className={col}><p className="font-bold text-gray-300">Legal</p>
          <Link className={link} href="/privacy">Privacy</Link><Link className={link} href="/terms">Terms</Link>
        </div>
      </div>
      <div className="border-t border-white/5 py-4 text-center text-[11px] text-gray-600">&copy; {new Date().getFullYear()} SAGE. All rights reserved.</div>
    </footer>
  );
}
