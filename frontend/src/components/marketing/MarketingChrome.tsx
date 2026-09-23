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
    <header className="border-b border-[#e6ddc9] bg-white/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-[#9c6b3f] flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></span>
          <span className="text-lg font-bold text-[#3d3335] tracking-tight">SAGE</span>
        </Link>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-8 text-xs font-semibold text-[#8a7d78]">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined} className={`hover:text-[#3d3335] transition-colors ${pathname === l.href ? "text-[#3d3335]" : ""}`}>{l.label}</Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          {signedIn ? (
            <Link href="/dashboard" className="px-4 py-2 text-xs font-bold bg-[#9c6b3f] text-white hover:bg-[#7f5631] rounded-lg transition-colors">Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="text-xs font-semibold text-[#8a7d78] hover:text-[#3d3335] transition-colors">Sign in</Link>
              <Link href="/register" className="px-4 py-2 text-xs font-bold bg-[#9c6b3f] text-white hover:bg-[#7f5631] rounded-lg transition-colors">Get started</Link>
            </>
          )}
        </div>

        <button className="md:hidden p-2 text-[#8a7d78] hover:text-[#3d3335]" onClick={() => setOpen(o => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <nav aria-label="Mobile" className="md:hidden border-t border-[#e6ddc9] px-4 py-4 flex flex-col gap-1 text-sm">
          {LINKS.map(l => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="px-3 py-2.5 rounded-lg text-[#6d6062] hover:bg-[#efe8d8]">{l.label}</Link>)}
          <div className="pt-3 flex gap-3">
            {signedIn ? (
              <Link href="/dashboard" className="flex-1 text-center px-4 py-2.5 text-xs font-bold bg-[#9c6b3f] text-white rounded-lg">Open dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="flex-1 text-center px-4 py-2.5 text-xs font-semibold border border-[#d9cdb8] rounded-lg text-[#5c5052]">Sign in</Link>
                <Link href="/register" className="flex-1 text-center px-4 py-2.5 text-xs font-bold bg-[#9c6b3f] text-white rounded-lg">Get started</Link>
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
  const link = "block text-[#8a7d78] hover:text-[#3d3335] transition-colors";
  return (
    <footer className="border-t border-[#e6ddc9] bg-[#f6f1e7] mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1 space-y-2">
          <p className="text-sm font-bold text-[#3d3335]">SAGE</p>
          <p className="text-xs text-[#8a7d78] leading-relaxed">Smart Analytics &amp; Growth Engine. An analyst that never clocks out.</p>
        </div>
        <div className={col}><p className="font-bold text-[#5c5052]">Product</p>
          <Link className={link} href="/#features">Features</Link><Link className={link} href="/#workflow">How it works</Link><Link className={link} href="/pricing">Pricing</Link>
        </div>
        <div className={col}><p className="font-bold text-[#5c5052]">Account</p>
          <Link className={link} href="/login">Sign in</Link><Link className={link} href="/register">Create workspace</Link><Link className={link} href="/forgot-password">Reset password</Link>
        </div>
        <div className={col}><p className="font-bold text-[#5c5052]">Legal</p>
          <Link className={link} href="/privacy">Privacy</Link><Link className={link} href="/terms">Terms</Link>
        </div>
      </div>
      <div className="border-t border-[#e6ddc9] py-4 text-center text-[11px] text-[#8a7d78]">&copy; {new Date().getFullYear()} SAGE. All rights reserved.</div>
    </footer>
  );
}
