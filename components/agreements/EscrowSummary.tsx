"use client";

import React from "react";
import { Lock, CheckCircle2, RotateCcw, Wallet } from "lucide-react";
import type { Agreement } from "@/types/agreement";
import { formatStroops } from "@/lib/escrow/planner";
import { agreementProgress, statusLabel } from "@/lib/escrow/status";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<
  Agreement["status"],
  "lime" | "outline" | "solid" | "danger"
> = {
  draft: "outline",
  funded: "solid",
  completed: "lime",
  cancelled: "danger",
};

/**
 * Escrow totals and a released/refunded/remaining progress bar for one
 * agreement. Every amount is rendered from bigint stroops via `formatStroops`,
 * so no value is lost to floating point.
 */
export function EscrowSummary({
  agreement,
  className,
}: {
  agreement: Agreement;
  className?: string;
}) {
  const { releasedPct, refundedPct } = agreementProgress(agreement);

  const settled = agreement.releasedStroops + agreement.refundedStroops;
  const available =
    agreement.escrowedStroops > settled ? agreement.escrowedStroops - settled : 0n;

  const rows: { icon: React.ElementType; label: string; value: bigint; tone: string }[] = [
    { icon: Wallet, label: "Total", value: agreement.totalStroops, tone: "text-ink" },
    { icon: Lock, label: "Escrowed", value: agreement.escrowedStroops, tone: "text-ink" },
    { icon: CheckCircle2, label: "Released", value: agreement.releasedStroops, tone: "text-accent-ink" },
    { icon: RotateCcw, label: "Refunded", value: agreement.refundedStroops, tone: "text-muted" },
  ];

  return (
    <div className={cn("card p-5", className)}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="t-eyebrow">Escrow</p>
          <p className="mt-0.5 text-xs text-muted">
            {agreement.milestoneCount} milestone
            {agreement.milestoneCount === 1 ? "" : "s"}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[agreement.status]}>
          {statusLabel(agreement.status)}
        </Badge>
      </div>

      {/* Progress bar */}
      <div
        className="mb-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-paper"
        role="img"
        aria-label={`Released ${releasedPct}%, refunded ${refundedPct}%`}
      >
        {releasedPct > 0 && (
          <div className="h-full bg-accent" style={{ width: `${releasedPct}%` }} />
        )}
        {refundedPct > 0 && (
          <div className="h-full bg-line" style={{ width: `${refundedPct}%` }} />
        )}
      </div>
      <div className="mb-5 flex items-center justify-between text-2xs text-muted-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Released
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-line" /> Refunded
        </span>
      </div>

      {/* Totals */}
      <dl className="grid grid-cols-2 gap-2.5">
        {rows.map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className="rounded-md border border-line bg-paper/60 p-3">
            <dt className="mb-1 flex items-center gap-1.5 text-2xs font-medium text-muted-faint">
              <Icon size={11} /> {label}
            </dt>
            <dd className={cn("text-sm font-semibold", tone)}>
              {formatStroops(value)}{" "}
              <span className="text-2xs font-medium text-muted-faint">tokens</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-center justify-between rounded-md bg-ink px-4 py-3">
        <span className="text-xs font-medium text-white/60">Still in escrow</span>
        <span className="text-base font-semibold tracking-tight text-accent">
          {formatStroops(available)}
        </span>
      </div>
    </div>
  );
}
