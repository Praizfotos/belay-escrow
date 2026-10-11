"use client";

import React from "react";
import {
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  Gavel,
  RotateCcw,
  FileCheck2,
  User,
} from "lucide-react";
import type { Agreement, Milestone, MilestoneStatus } from "@/types/agreement";
import { formatStroops } from "@/lib/escrow/planner";
import { milestoneStatusLabel } from "@/lib/escrow/status";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<MilestoneStatus, string> = {
  pending: "bg-paper text-muted border-line",
  submitted: "bg-accent-soft text-accent-ink border-accent/40",
  released: "bg-accent text-ink border-transparent",
  refunded: "bg-surface text-muted border-line",
  disputed: "bg-danger-soft text-danger border-danger/25",
};

export interface MilestoneListHandlers {
  onSubmit: (index: number) => void;
  onApprove: (index: number) => void;
  onDispute: (index: number) => void;
  onEscalate: (index: number) => void;
  onResolve: (index: number) => void;
  onRefund: (index: number) => void;
}

interface MilestoneListProps {
  agreement: Agreement;
  milestones: Milestone[];
  publicKey: string | null;
  handlers: MilestoneListHandlers;
  /** Milestone index with an action currently awaiting the wallet, if any. */
  pendingIndex?: number | null;
  className?: string;
}

function isOverdue(milestone: Milestone): boolean {
  return (
    milestone.status === "pending" &&
    milestone.dueAt > 0 &&
    milestone.dueAt * 1000 < Date.now()
  );
}

/** One-line hint about who is expected to act on this milestone next. */
function nextActorHint(
  milestone: Milestone,
  isClient: boolean,
  isFreelancer: boolean,
): string | null {
  if (!isClient && !isFreelancer) return null;
  switch (milestone.status) {
    case "pending":
      return isFreelancer
        ? "Next: you submit the work"
        : "Next: the freelancer submits the work";
    case "submitted":
      return isClient
        ? "Next: you review — approve to release, or dispute"
        : "Next: the client reviews — you can escalate if it stalls";
    case "disputed":
      return "In dispute: the contract's arbitrator resolves it (release or refund)";
    case "released":
      return "Settled: tokens were released to the freelancer";
    case "refunded":
      return "Settled: tokens were refunded to the client";
    default:
      return null;
  }
}

/**
 * Milestone schedule for one agreement. Action buttons are shown per the
 * viewer's role (client or freelancer) and the milestone's current status; the
 * contract enforces authorization, this only decides what is worth offering.
 */
export function MilestoneList({
  agreement,
  milestones,
  publicKey,
  handlers,
  pendingIndex = null,
  className,
}: MilestoneListProps) {
  const isClient = !!publicKey && publicKey === agreement.client;
  const isFreelancer = !!publicKey && publicKey === agreement.freelancer;

  if (milestones.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-line bg-surface p-8 text-center",
          className,
        )}
      >
        <FileCheck2 size={18} className="mx-auto mb-2 text-muted-faint" />
        <p className="text-sm font-semibold text-ink">No milestones yet</p>
        <p className="mt-1 text-xs text-muted">
          This agreement has no milestone schedule.
        </p>
      </div>
    );
  }

  const ordered = [...milestones].sort((a, b) => a.index - b.index);

  return (
    <ol className={cn("space-y-3", className)}>
      {ordered.map((milestone, position) => {
        const busy = pendingIndex === milestone.index;
        const overdue = isOverdue(milestone);
        const hint = nextActorHint(milestone, isClient, isFreelancer);

        return (
          <li
            key={milestone.index}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-paper text-2xs font-bold text-muted">
                {position + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold",
                      STATUS_STYLES[milestone.status],
                    )}
                  >
                    {milestone.status === "disputed" && <AlertTriangle size={10} />}
                    {milestone.status === "released" && <CheckCircle2 size={10} />}
                    {milestoneStatusLabel(milestone.status)}
                  </span>
                  {overdue && (
                    <span className="inline-flex items-center gap-1 text-2xs font-semibold text-warn">
                      <Clock size={10} /> Overdue
                    </span>
                  )}
                </div>

                <p className="break-words text-sm font-medium text-ink">
                  {milestone.description || "Untitled milestone"}
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted">
                  <span className="font-semibold text-ink">
                    {formatStroops(milestone.amountStroops)}{" "}
                    <span className="font-medium text-muted-faint">tokens</span>
                  </span>
                  {milestone.dueAt > 0 && (
                    <span>
                      Due {new Date(milestone.dueAt * 1000).toLocaleDateString()}
                    </span>
                  )}
                  {milestone.evidence && (
                    <span className="max-w-[240px] truncate">
                      Evidence: {milestone.evidence}
                    </span>
                  )}
                </div>

                {hint && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-2xs text-muted-faint">
                    <User size={10} /> {hint}
                  </p>
                )}
              </div>
            </div>

            {/* Action row */}
            {(isClient || isFreelancer) && (
              <div className="mt-3 flex flex-wrap gap-2 pl-9">
                {isFreelancer && milestone.status === "pending" && (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={busy}
                    onClick={() => handlers.onSubmit(milestone.index)}
                  >
                    <Send size={13} /> Submit work
                  </Button>
                )}

                {isClient && milestone.status === "submitted" && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busy}
                      onClick={() => handlers.onApprove(milestone.index)}
                    >
                      <CheckCircle2 size={13} /> Approve &amp; release
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => handlers.onDispute(milestone.index)}
                    >
                      <AlertTriangle size={13} /> Dispute
                    </Button>
                  </>
                )}

                {isFreelancer && milestone.status === "submitted" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => handlers.onEscalate(milestone.index)}
                  >
                    <Gavel size={13} /> Escalate
                  </Button>
                )}

                {milestone.status === "disputed" && (isClient || isFreelancer) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => handlers.onResolve(milestone.index)}
                  >
                    <Gavel size={13} /> Resolve as arbitrator
                  </Button>
                )}

                {isClient && overdue && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy}
                    onClick={() => handlers.onRefund(milestone.index)}
                  >
                    <RotateCcw size={13} /> Refund overdue
                  </Button>
                )}
              </div>
            )}

            {milestone.status === "disputed" && (isClient || isFreelancer) && (
              <p className="mt-2 pl-9 text-2xs leading-relaxed text-muted-faint">
                Only the contract&apos;s designated arbitrator (or the admin, if
                no arbitrator is set) can resolve this. If that&apos;s you, choose
                release or refund above; the outcome is recorded on-chain.
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
