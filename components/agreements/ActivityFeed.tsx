"use client";

import React from "react";
import {
  FilePlus2,
  Coins,
  Send,
  CheckCircle2,
  AlertTriangle,
  Gavel,
  RotateCcw,
  XCircle,
  Flag,
  Activity,
  AlertCircle,
} from "lucide-react";
import type { ContractEscrowEvent } from "@/types/contract";
import { TransactionHash } from "@/components/payment/TransactionHash";
import { formatStroops } from "@/lib/escrow/planner";
import { formatAddress, cn } from "@/lib/utils";

const KIND_META: Record<
  ContractEscrowEvent["kind"],
  { label: string; icon: React.ElementType; tone: string; bg: string }
> = {
  created: { label: "Agreement created", icon: FilePlus2, tone: "text-muted", bg: "bg-paper" },
  funded: { label: "Escrow funded", icon: Coins, tone: "text-accent-ink", bg: "bg-accent-soft" },
  submitted: { label: "Work submitted", icon: Send, tone: "text-ink", bg: "bg-accent-soft" },
  approved: { label: "Milestone approved & released", icon: CheckCircle2, tone: "text-accent-ink", bg: "bg-accent-soft" },
  disputed: { label: "Milestone disputed", icon: AlertTriangle, tone: "text-danger", bg: "bg-danger-soft" },
  resolved: { label: "Dispute resolved", icon: Gavel, tone: "text-muted", bg: "bg-paper" },
  refunded: { label: "Milestone refunded", icon: RotateCcw, tone: "text-muted", bg: "bg-paper" },
  cancelled: { label: "Agreement cancelled", icon: XCircle, tone: "text-danger", bg: "bg-danger-soft" },
  completed: { label: "Agreement completed", icon: Flag, tone: "text-accent-ink", bg: "bg-accent-soft" },
};

/**
 * On-chain activity for one agreement, fed by `useContractEvents`. Rendered
 * newest-first; each event links through to the explorer.
 */
export function ActivityFeed({
  events,
  isLoading = false,
  error = null,
  className,
}: {
  events: ContractEscrowEvent[];
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}) {
  const sorted = [...events].sort((a, b) => b.ledger - a.ledger);

  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <Activity size={14} className="text-accent-ink" />
        <p className="text-sm font-bold text-ink">On-chain activity</p>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading && sorted.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-faint">
          Listening for events…
        </p>
      ) : sorted.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-faint">
          No on-chain activity yet.
        </p>
      ) : (
        <ol className="p-2">
          {sorted.map((event, index) => {
            const meta = KIND_META[event.kind] ?? KIND_META.created;
            const Icon = meta.icon;
            const time =
              event.ledgerClosedAt &&
              !Number.isNaN(Date.parse(event.ledgerClosedAt))
                ? new Date(event.ledgerClosedAt).toLocaleTimeString()
                : `Ledger ${event.ledger}`;
            const amount =
              typeof event.amountStroops === "string" &&
              event.amountStroops !== ""
                ? `${formatStroops(event.amountStroops)} tokens`
                : null;

            return (
              <li key={`${event.ledger}-${index}-${event.txHash ?? index}`}>
                <div className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-paper">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                      meta.bg,
                    )}
                  >
                    <Icon size={14} className={meta.tone} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="text-sm font-semibold text-ink">{meta.label}</p>
                      {amount && (
                        <span className="text-xs font-semibold text-accent-ink">{amount}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-2xs text-muted-faint">
                      {time}
                      {event.actor
                        ? ` · ${formatAddress(event.actor, 4)}`
                        : ` · Ledger ${event.ledger}`}
                    </p>
                  </div>
                  {event.txHash && (
                    <TransactionHash hash={event.txHash} compact className="shrink-0" />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
