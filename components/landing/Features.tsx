"use client";

import React from "react";
import { motion } from "framer-motion";
import { Layers, BadgeCheck, Scale } from "lucide-react";

/**
 * The three product promises, each explained in the workflow terms it actually
 * delivers — no feature-count theatrics.
 */
const promises = [
  {
    icon: Layers,
    title: "Structure work into funded milestones",
    body: "Break an agreement into up to 24 milestones, each with its own deliverable, amount and optional due date. The client funds the escrow before work starts, so payment is never in question.",
    detail: [
      "Live schedule validation that mirrors the on-chain limits",
      "Escrow totals shown in exact token amounts",
      "Draft → funded states are visible to both parties",
    ],
  },
  {
    icon: BadgeCheck,
    title: "Submit work, get paid on-chain",
    body: "The freelancer submits each milestone with a note of evidence. The client approves, and the contract releases that milestone's tokens — a real Stellar transaction, not an invoice promise.",
    detail: [
      "Every release produces a public transaction hash",
      "Payments settle in seconds on the Stellar network",
      "Nothing moves until the client approves",
    ],
  },
  {
    icon: Scale,
    title: "Transparent terms, a defined dispute path",
    body: "Either party can flag a disputed milestone. Funds stay locked while the disagreement is reviewed, and the contract's arbitrator releases to the freelancer or refunds the client — on-chain, with a record.",
    detail: [
      "Disputed funds never vanish into a support ticket",
      "Overdue milestones can be refunded by the client",
      "Every state change is visible to both parties",
    ],
  },
];

export default function Features() {
  return (
    <section id="promises" className="section-pad border-b border-line bg-surface">
      <div className="container-page">
        <div className="max-w-2xl">
          <p className="t-eyebrow mb-3">What Belay does</p>
          <h2 className="t-h1 text-ink">
            Three promises, kept by the contract — not by trust.
          </h2>
          <p className="t-body-lg mt-4">
            Belay is a financial workflow first: define the work, secure the
            money, settle on-chain. The escrow contract is what makes each
            promise enforceable.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {promises.map((p, i) => (
            <motion.article
              key={p.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="card flex flex-col p-6"
            >
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-paper">
                <p.icon size={16} className="text-accent-ink" />
              </div>
              <h3 className="t-h3 text-ink">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
              <ul className="mt-5 space-y-2 border-t border-line pt-4">
                {p.detail.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    {d}
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
