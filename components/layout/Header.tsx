"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Menu,
  X,
  LogOut,
  User,
  LayoutDashboard,
  FileSignature,
  Plus,
  ChevronDown,
  Copy,
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/context/AuthContext";
import { cn, formatAddress } from "@/lib/utils";
import { BelayLogo } from "@/components/ui/Logo";

/**
 * Landing header. The primary nav always maps to the real product journeys —
 * Dashboard, Agreements, New agreement — with an in-page anchor for "How it
 * works" only while on the landing page.
 */
export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { isConnected, publicKey, disconnect } = useWallet();
  const { user, isAuthenticated, signOut } = useAuth();

  const onLanding = pathname === "/";

  const journeyLinks = [
    ...(onLanding
      ? [{ label: "How it works", href: "#how-it-works", external: false }]
      : []),
    { label: "Dashboard", href: "/dashboard", external: false },
    { label: "Agreements", href: "/agreements", external: false },
    { label: "New agreement", href: "/agreements/new", external: false },
  ];

  const handleSignOut = async () => {
    await signOut();
    disconnect();
    setUserMenuOpen(false);
    setMobileOpen(false);
  };

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-surface/90 backdrop-blur-sm">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Link href="/" className="shrink-0" aria-label="Belay home">
            <BelayLogo size="md" />
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {journeyLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-paper hover:text-ink transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {isAuthenticated || isConnected ? (
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 hover:border-muted-faint transition-colors"
                >
                  <div className="w-6 h-6 rounded-sm bg-paper flex items-center justify-center">
                    <User size={13} className="text-ink" />
                  </div>
                  <span className="text-sm font-medium text-ink">
                    {user?.displayName || (publicKey ? formatAddress(publicKey, 4) : "")}
                  </span>
                  <ChevronDown
                    size={13}
                    className={cn(
                      "text-muted-faint transition-transform duration-150",
                      userMenuOpen && "rotate-180"
                    )}
                  />
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute right-0 mt-2 w-60 rounded-lg border border-line bg-surface shadow-pop overflow-hidden z-50"
                    >
                      <div className="px-4 pt-4 pb-3 border-b border-line">
                        <p className="t-eyebrow mb-1.5">Wallet</p>
                        <button
                          onClick={copyAddress}
                          className="w-full flex items-center gap-2 rounded-sm bg-paper px-2.5 py-1.5 transition-colors hover:bg-line/50"
                        >
                          <span className="truncate flex-1 text-left font-mono text-xs text-ink">
                            {publicKey ? formatAddress(publicKey, 8) : ""}
                          </span>
                          <Copy size={12} className="shrink-0 text-muted-faint" />
                        </button>
                        {copied && (
                          <p className="mt-1 text-center text-xs text-accent-ink">Copied</p>
                        )}
                      </div>

                      <div className="px-2 py-2">
                        {journeyLinks
                          .filter((l) => !l.href.startsWith("#"))
                          .map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={() => setUserMenuOpen(false)}
                              className="flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium text-ink hover:bg-paper transition-colors"
                            >
                              {link.href === "/dashboard" && <LayoutDashboard size={15} className="text-muted" />}
                              {link.href === "/agreements" && <FileSignature size={15} className="text-muted" />}
                              {link.href === "/agreements/new" && <Plus size={15} className="text-muted" />}
                              {link.label}
                            </Link>
                          ))}
                      </div>

                      <div className="border-t border-line px-2 py-1">
                        <button
                          onClick={handleSignOut}
                          className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft transition-colors"
                        >
                          <LogOut size={15} />
                          Sign out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link
                href="/auth"
                className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex h-9 w-9 items-center justify-center rounded-md text-ink hover:bg-paper transition-colors"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-x-4 top-[4.75rem] z-40 rounded-lg border border-line bg-surface shadow-pop p-3 md:hidden"
          >
            <nav className="flex flex-col gap-1">
              {journeyLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-sm px-3 py-2.5 text-sm font-medium text-ink hover:bg-paper transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-2 border-t border-line pt-2">
              {isAuthenticated || isConnected ? (
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger-soft transition-colors"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              ) : (
                <Link
                  href="/auth"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-md bg-ink px-4 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Sign in
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
