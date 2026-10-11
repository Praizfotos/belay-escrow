"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileSignature, Plus } from "lucide-react";
import { BelayLogo } from "@/components/ui/Logo";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agreements", href: "/agreements", icon: FileSignature },
  { label: "New agreement", href: "/agreements/new", icon: Plus },
];

/**
 * App-shell header for every authenticated journey (dashboard, agreements,
 * new agreement, agreement detail). Maps 1:1 to the real product routes.
 */
export function AppHeader({ className }: { className?: string }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/agreements"
      ? pathname === "/agreements"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-sm",
        className
      )}
    >
      <div className="container-page flex h-14 items-center justify-between gap-4">
        <Link href="/" aria-label="Belay home" className="shrink-0">
          <BelayLogo size="sm" />
        </Link>

        <nav className="hidden sm:flex items-center gap-1" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-paper text-ink"
                  : "text-muted hover:text-ink hover:bg-paper/70"
              )}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Mobile: compact icon links so the journeys stay reachable */}
          <nav className="flex sm:hidden items-center gap-0.5" aria-label="Primary">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  isActive(item.href)
                    ? "bg-paper text-ink"
                    : "text-muted hover:text-ink"
                )}
              >
                <item.icon size={15} />
              </Link>
            ))}
          </nav>
          <ConnectWalletButton />
        </div>
      </div>
    </header>
  );
}
