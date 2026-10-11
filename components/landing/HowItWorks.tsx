"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  FilePlus2,
  Lock,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

const steps = [
  {
    number: "01",
    icon: FilePlus2,
    title: "Create the agreement",
    body: "The client names the work, adds the freelancer's Stellar address and writes the milestone schedule — each milestone is a deliverable, an amount and an optional due date.",
    actor: "Client",
  },
  {
    number: "02",
    icon: Lock,
    title: "Fund the escrow",
    body: "One Freighter signature locks the milestone tokens in the Soroban escrow contract. Both parties can see the funded state; the freelancer won't start against an empty escrow.",
    actor: "Client",
  },
  {
    number: "03",
    icon: Upload,
    title: "Submit the work",
    body: "The freelancer submits each milestone with a short evidence note. The milestone moves to “submitted” and waits for the client's review.",
    actor: "Freelancer",
  },
  {
    number: "04",
    icon: CheckCircle2,
    title: "Approve and release",
    body: "The client approves the milestone and its tokens are released to the freelancer on-chain. The transaction hash is public — anyone can verify it on a Stellar explorer.",
    actor: "Client",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="section-pad border-b border-line bg-paper">
      <div className="container-page">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_0.85fr] lg:gap-16">
          <div>
            <div className="max-w-xl">
              <p className="t-eyebrow mb-3">How it works</p>
              <h2 className="t-h1 text-ink">From handshake to settlement, in four steps.</h2>
              <p className="t-body-lg mt-4">
                The same flow for a one-off logo or a six-month build: define,
                fund, deliver, settle. Every step is a transaction both parties
                can watch.
              </p>
            </div>

            <ol className="mt-10 space-y-0">
              {steps.map((step, i) => (
                <motion.li
                  key={step.number}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="relative flex gap-5 pb-8 last:pb-0"
                >
                  {i < steps.length - 1 && (
                    <span className="absolute left-[19px] top-11 bottom-0 w-px bg-line" aria-hidden="true" />
                  )}
                  <div className="relative shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-surface">
                      <step.icon size={16} className="text-ink" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-2xs font-semibold text-muted-faint">
                        {step.number}
                      </span>
                      <span className="rounded-full bg-paper px-2 py-0.5 text-2xs font-semibold text-muted">
                        {step.actor}
                      </span>
                    </div>
                    <h3 className="t-h3 text-ink">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="lg:sticky lg:top-24 lg:self-start"
          >
            <div className="card overflow-hidden">
              <div className="border-b border-line px-5 py-3">
                <p className="t-eyebrow">What a release looks like</p>
              </div>
              <div className="space-y-3 px-5 py-4 font-mono text-xs leading-relaxed">
                <p className="text-muted-faint">
                  # client approves a submitted milestone
                </p>
                <p className="text-ink">
                  approve_milestone(
                  <br />
                  &nbsp;&nbsp;agreement_id: &quot;agr-9f3a…&quot;,
                  <br />
                  &nbsp;&nbsp;index: 2,
                  <br />
                  );
                </p>
                <p className="text-muted-faint"># signed in Freighter, submitted to the network</p>
                <p className="text-accent-ink">
                  ✓ confirmed · tx 4f3a…c8e2
                  <br />
                  &nbsp;&nbsp;650 tokens released to freelancer
                </p>
              </div>
              <div className="border-t border-line px-5 py-3">
                <p className="text-2xs text-muted-faint">
                  Illustrative. In the app every call is signed by your own
                  wallet and links to the real transaction.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-warn/20 bg-warn-soft px-4 py-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
                <div>
                  <p className="text-sm font-semibold text-ink">If work goes sideways</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    Either party can dispute a milestone. The tokens stay locked
                    in escrow until the contract&apos;s arbitrator resolves it —
                    released to the freelancer or refunded to the client.
                    <ArrowRight size={11} className="ml-1 inline" />{" "}
                    <a href="#disputes" className="font-semibold text-accent-ink underline underline-offset-2">
                      How disputes work
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
