"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, User, Briefcase, Layers } from "lucide-react";
import type { Agreement } from "@/types/agreement";
import { formatStroops } from "@/lib/escrow/planner";
import { agreementProgress, statusLabel } from "@/lib/escrow/status";
import { Badge } from "@/components/ui/Badge";
import { formatAddress, cn } from "@/lib/utils";

const STATUS_VARIANT: Record<Agreement["status"], "lime" | "outline" | "solid" | "danger"> = {
  draft: "outline",
  funded: "solid",
  completed: "lime",
  cancelled: "danger",
};

/** Compact agreement card for lists — role-aware counterparty and progress. */
export function AgreementCard({
  agreement,
  publicKey,
  className,
}: {
  agreement: Agreement;
  publicKey?: string | null;
  className?: string;
}) {
  const isClient = !!publicKey && publicKey === agreement.client;
  const isFreelancer = !!publicKey && publicKey === agreement.freelancer;
  const counterparty = isFreelancer
    ? { icon: User, label: "Client", address: agreement.client }
    : { icon: Briefcase, label: "Freelancer", address: agreement.freelancer };
  const { settledPct } = agreementProgress(agreement);

  return (
    <Link
      href={`/agreements/${agreement.id}`}
      className={cn(
        "group block rounded-lg border border-line bg-surface p-4 transition-colors",
        "hover:border-muted-faint",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {agreement.title || "Untitled agreement"}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted">
            <counterparty.icon size={11} />
            {counterparty.label}:{" "}
            <span className="font-mono">
              {formatAddress(counterparty.address, 5) || "—"}
            </span>
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[agreement.status]}>
          {statusLabel(agreement.status)}
        </Badge>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-base font-semibold tracking-tight text-ink">
          {formatStroops(agreement.totalStroops)}
        </span>
        <span className="text-2xs font-medium text-muted-faint">tokens</span>
        {isClient && (
          <span className="ml-auto rounded-full bg-paper px-2 py-0.5 text-2xs font-semibold text-muted">
            You&apos;re the client
          </span>
        )}
        {isFreelancer && (
          <span className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-2xs font-semibold text-accent-ink">
            You&apos;re the freelancer
          </span>
        )}
      </div>

      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-paper">
        <div className="h-full bg-accent" style={{ width: `${settledPct}%` }} />
      </div>

      <div className="mt-2 flex items-center justify-between text-2xs text-muted-faint">
        <span className="inline-flex items-center gap-1.5">
          <Layers size={11} /> {agreement.milestoneCount} milestone
          {agreement.milestoneCount === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-muted transition-colors group-hover:text-ink">
          Open <ArrowRight size={11} />
        </span>
      </div>
    </Link>
  );
}
