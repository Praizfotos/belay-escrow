"use client";

import React from "react";
import Link from "next/link";
import { ExternalLink, ArrowUpRight } from "lucide-react";
import { BelayLogo } from "@/components/ui/Logo";

const footerLinks = {
  Product: [
    { label: "How it works", href: "/#how-it-works" },
    { label: "Promises", href: "/#promises" },
    { label: "Disputes & transparency", href: "/#disputes" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "New agreement", href: "/agreements/new" },
  ],
  Resources: [
    { label: "Freighter wallet", href: "https://freighter.app", external: true },
    { label: "Stellar developers", href: "https://stellar.org/developers", external: true },
    { label: "Stellar testnet explorer", href: "https://stellar.expert/explorer/testnet", external: true },
    { label: "Soroban docs", href: "https://developers.stellar.org/docs/build/smart-contracts/overview", external: true },
  ],
};

export default function Footer() {
  return (
    <footer className="on-dark border-t border-white/10 bg-ink text-white">
      <div className="container-page py-14">
        <div className="grid grid-cols-1 gap-10 pb-10 border-b border-white/10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link href="/" className="inline-flex mb-4" aria-label="Belay home">
              <BelayLogo size="md" variant="dark" />
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-white/55">
              Milestone escrow for freelance work, settled on the Stellar
              network. Fund milestones, approve deliverables, get paid on-chain.
            </p>
            <a
              href="https://stellar.org"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              Built on Stellar
              <ExternalLink size={12} />
            </a>
          </div>

          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-2 gap-8">
            {Object.entries(footerLinks).map(([category, links]) => (
              <div key={category}>
                <h4 className="mb-4 text-2xs font-semibold uppercase tracking-[0.14em] text-white/40">
                  {category}
                </h4>
                <ul className="space-y-2.5">
                  {links.map((link) =>
                    "external" in link && link.external ? (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex items-center gap-1 text-sm text-white/60 transition-colors hover:text-white"
                        >
                          {link.label}
                          <ArrowUpRight size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
                        </a>
                      </li>
                    ) : (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          className="text-sm text-white/60 transition-colors hover:text-white"
                        >
                          {link.label}
                        </Link>
                      </li>
                    )
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 pt-6 sm:flex-row">
          <p className="text-xs text-white/40">
            © 2026 Belay · Running on Stellar Testnet
          </p>
          <p className="text-xs text-white/40">
            Open source · No platform fees · Non-custodial
          </p>
        </div>
      </div>
    </footer>
  );
}
