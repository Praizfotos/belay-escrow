"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Lock,
  Upload,
  CheckCircle2,
  Shield,
  TestTube2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

/* ── Example agreement card (clearly illustrative) ── */

const EXAMPLE_MILESTONES = [
  { n: 1, label: "Discovery & wireframes", amount: "250", state: "released" as const },
  { n: 2, label: "Build & review", amount: "400", state: "submitted" as const },
  { n: 3, label: "Launch & handover", amount: "350", state: "pending" as const },
];

function stateChip(state: (typeof EXAMPLE_MILESTONES)[number]["state"]) {
  if (state === "released")
    return <span className="badge-accent">Released</span>;
  if (state === "submitted")
    return (
      <span className="inline-flex items-center rounded-full border border-line bg-paper px-2.5 py-0.5 text-2xs font-semibold text-ink">
        Awaiting approval
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-2xs font-semibold text-muted">
      Funded
    </span>
  );
}

const ExampleAgreementCard = () => (
  <div className="card w-full max-w-sm overflow-hidden">
    <div className="flex items-center justify-between border-b border-line px-5 py-4">
      <div>
        <p className="t-eyebrow">Example agreement</p>
        <p className="mt-1 text-sm font-semibold text-ink">Website redesign</p>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-2xs font-semibold text-accent-ink">
        <Lock size={11} /> 1,000 tokens in escrow
      </span>
    </div>

    <ol className="divide-y divide-line">
      {EXAMPLE_MILESTONES.map((m) => (
        <li key={m.n} className="flex items-center gap-3 px-5 py-3.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-paper text-2xs font-bold text-muted">
            {m.n}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{m.label}</p>
            <p className="text-2xs text-muted-faint">{m.amount} tokens</p>
          </div>
          {stateChip(m.state)}
        </li>
      ))}
    </ol>

    <div className="border-t border-line bg-paper px-5 py-3">
      <p className="text-2xs leading-relaxed text-muted">
        The client approves milestone 2 to release its payment; every action
        settles as a Stellar transaction.
      </p>
    </div>
  </div>
);

export default function Hero() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative overflow-hidden border-b border-line bg-paper">
      <div className="container-page relative grid grid-cols-1 items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
        <motion.div variants={stagger} initial="hidden" animate="visible">
          <motion.p variants={fadeUp} custom={0} className="mb-5">
            <span className="badge-accent">
              <Shield size={11} /> Milestone escrow on Stellar
            </span>
          </motion.p>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="t-display text-balance text-ink"
          >
            Fund milestones.
            <br />
            Ship work.
            <br />
            Get paid on-chain.
          </motion.h1>

          <motion.p variants={fadeUp} custom={2} className="t-body-lg mt-6 max-w-xl">
            Belay holds each milestone&apos;s payment in a Soroban escrow
            contract while the work happens. Submit, approve, and settle on the
            Stellar network — with a transparent record and a defined dispute
            path when things go wrong.
          </motion.p>

          <motion.div variants={fadeUp} custom={3} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button variant="primary" size="lg" asChild>
              <Link href={isAuthenticated ? "/dashboard" : "/auth"}>
                {isAuthenticated ? "Go to dashboard" : "Get started"}
                <ArrowRight size={16} />
              </Link>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </motion.div>

          <motion.ul
            variants={fadeUp}
            custom={4}
            className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted"
          >
            {[
              { icon: Shield, text: "Non-custodial — keys stay in Freighter" },
              { icon: TestTube2, text: "Running on Stellar Testnet" },
              { icon: Upload, text: "No platform fee, open source" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="inline-flex items-center gap-1.5">
                <Icon size={14} className="text-accent-ink" />
                {text}
              </li>
            ))}
          </motion.ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="flex justify-center lg:justify-end"
        >
          <div className="w-full max-w-sm">
            <ExampleAgreementCard />
            <div className={cn(
              "mt-3 flex items-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-3",
            )}>
              <CheckCircle2 size={15} className="shrink-0 text-accent-ink" />
              <p className="text-xs leading-relaxed text-muted">
                Approving a milestone releases its tokens to the freelancer and
                writes a transaction hash you can open on a public explorer.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
