"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  ScrollText,
  Gavel,
  Lock,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";

const guarantees = [
  {
    icon: Lock,
    title: "On-chain",
    body: "Agreement state, milestone amounts, funding, releases, refunds and dispute outcomes. Signed by the parties' wallets and settled by the Soroban contract.",
  },
  {
    icon: ScrollText,
    title: "In the agreement record",
    body: "Human details: the milestone descriptions, due dates and the evidence note a freelancer attaches when submitting work.",
  },
  {
    icon: Gavel,
    title: "Disputes",
    body: "A disputed milestone's tokens stay locked. The contract's arbitrator (or the admin, if none is set) resolves it by releasing to the freelancer or refunding the client — the outcome is another on-chain transaction.",
  },
];

/* ── Illustrative explorer panel ── */

const MockExplorer = () => (
  <div className="rounded-lg border border-white/10 bg-white/[0.04] overflow-hidden">
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
      <span className="font-mono text-2xs text-white/50">
        stellar.expert/explorer/testnet
      </span>
      <ExternalLink size={12} className="text-white/40" />
    </div>
    <div className="space-y-3 px-4 py-4">
      <div>
        <p className="t-eyebrow text-white/40">Example transaction</p>
        <p className="mt-1 break-all font-mono text-xs text-accent">
          4f3a892c…8e2f1d20
        </p>
      </div>
      {[
        { label: "Type", value: "milestone release" },
        { label: "Amount", value: "400.0000000 tokens" },
        { label: "Paid to", value: "G…RH4 · freelancer" },
        { label: "Network fee", value: "0.00001 XLM" },
      ].map(({ label, value }) => (
        <div
          key={label}
          className="flex items-center justify-between border-t border-white/10 pt-3 text-xs"
        >
          <span className="text-white/50">{label}</span>
          <span className="font-mono font-medium text-white/85">{value}</span>
        </div>
      ))}
    </div>
  </div>
);

export default function DarkSection() {
  const { isAuthenticated } = useAuth();

  return (
    <section id="disputes" className="on-dark section-pad bg-ink">
      <div className="container-page">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[1fr_0.8fr] lg:gap-16">
          <div>
            <p className="mb-3 text-2xs font-semibold uppercase tracking-[0.14em] text-white/40">
              Transparency &amp; disputes
            </p>
            <h2 className="t-h1 text-white">
              You can read the escrow the same way the contract does.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/60">
              Belay doesn&apos;t ask you to trust a company with your money.
              Balances, approvals and refunds live in a public Soroban contract
              on Stellar Testnet — and the disagreement path is written into it,
              not into a support inbox.
            </p>

            <div className="mt-8 space-y-3">
              {guarantees.map((g, i) => (
                <motion.div
                  key={g.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-lg border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="flex items-center gap-2.5">
                    <g.icon size={15} className="shrink-0 text-accent" />
                    <h3 className="text-sm font-semibold text-white">{g.title}</h3>
                  </div>
                  <p className="mt-2 pl-6 text-sm leading-relaxed text-white/55">
                    {g.body}
                  </p>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button variant="accent" size="lg" asChild>
                <Link href={isAuthenticated ? "/agreements/new" : "/auth"}>
                  Create an agreement
                  <ArrowRight size={16} />
                </Link>
              </Button>
              <Button variant="ghost-white" size="lg" asChild>
                <a
                  href="https://stellar.expert/explorer/testnet"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open the testnet explorer
                  <ExternalLink size={15} />
                </a>
              </Button>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4 lg:sticky lg:top-24"
          >
            <MockExplorer />

            <div className="flex items-start gap-3 rounded-lg border border-accent/25 bg-accent/10 px-4 py-3">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <p className="text-sm font-semibold text-white">
                  Verifiable, not just visible
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/55">
                  Every release and refund in Belay links to its transaction
                  hash — paste it into any Stellar explorer to check it
                  yourself.
                </p>
              </div>
            </div>

            <p className="text-2xs leading-relaxed text-white/35">
              Illustrative panel. Values shown are examples; real agreements
              link to live testnet transactions.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
