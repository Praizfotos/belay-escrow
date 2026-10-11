"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Zap, Scale } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";

const facts = [
  { icon: Shield, text: "Non-custodial — Freighter signs, keys stay local" },
  { icon: Zap, text: "Stellar settles in seconds, for a fraction of a cent" },
  { icon: Scale, text: "Zero Belay platform fee — you pay the network fee only" },
];

export default function CTASection() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="section-pad bg-paper">
      <div className="container-page">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="card overflow-hidden"
        >
          <div className="grid grid-cols-1 gap-8 p-8 sm:p-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <h2 className="t-h1 text-balance text-ink">
                Ready to fund your first milestone?
              </h2>
              <p className="t-body-lg mt-4 max-w-xl">
                Connect a Freighter wallet, create an agreement with your
                milestone schedule, and lock the escrow. Belay runs on Stellar
                Testnet today — everything is real except the value of the
                tokens.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button variant="primary" size="lg" asChild>
                  <Link href={isAuthenticated ? "/agreements/new" : "/auth"}>
                    {isAuthenticated ? "New agreement" : "Get started free"}
                    <ArrowRight size={16} />
                  </Link>
                </Button>
                <Button variant="secondary" size="lg" asChild>
                  <a
                    href="https://freighter.app"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get Freighter
                  </a>
                </Button>
              </div>
            </div>

            <ul className="space-y-3 border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              {facts.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <Icon size={15} className="mt-0.5 shrink-0 text-accent-ink" />
                  <span className="text-sm leading-relaxed text-muted">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
