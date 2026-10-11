import type { AgreementStatus, MilestoneStatus } from "@/types/agreement";

function percentage(part: bigint, total: bigint): number {
  if (total <= 0n || part <= 0n) return 0;
  const clamped = part > total ? total : part;
  return Math.min(100, Number((clamped * 10_000n) / total) / 100);
}

export function agreementProgress(e: {
  totalStroops: bigint;
  releasedStroops: bigint;
  refundedStroops: bigint;
}): {
  releasedPct: number;
  refundedPct: number;
  settledPct: number;
  remainingPct: number;
} {
  const total = e.totalStroops;
  const released = e.releasedStroops > 0n ? e.releasedStroops : 0n;
  const refunded = e.refundedStroops > 0n ? e.refundedStroops : 0n;
  const settled = released + refunded;
  const remaining = total - settled;

  return {
    releasedPct: percentage(released, total),
    refundedPct: percentage(refunded, total),
    settledPct: percentage(settled, total),
    remainingPct: remaining > 0n ? percentage(remaining, total) : 0,
  };
}

const AGREEMENT_LABELS: Record<AgreementStatus, string> = {
  draft: "Draft",
  funded: "Funded",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function statusLabel(s: AgreementStatus): string {
  return AGREEMENT_LABELS[s] ?? "Draft";
}

const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  pending: "Pending",
  submitted: "Submitted",
  released: "Released",
  refunded: "Refunded",
  disputed: "Disputed",
};

export function milestoneStatusLabel(s: MilestoneStatus): string {
  return MILESTONE_LABELS[s] ?? "Pending";
}

export function isActive(s: AgreementStatus): boolean {
  return s === "draft" || s === "funded";
}
