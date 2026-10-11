"use client";

import React from "react";
import Link from "next/link";
import { UserRound, ShieldAlert, TrendingUp, ChevronRight } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useAgreements } from "@/context/AgreementContext";
import { useMilestone } from "@/hooks/useMilestone";
import type { Agreement, Milestone } from "@/types/agreement";
import { cn } from "@/lib/utils";

interface PendingAction {
  id: string;
  label: string;
  detail: string;
  href: string;
  tone: "fund" | "approve" | "dispute";
}

function fundActionFor(agreement: Agreement, publicKey: string): PendingAction | null {
  if (
    publicKey !== agreement.client ||
    agreement.status !== "draft" ||
    agreement.escrowedStroops >= agreement.totalStroops
  ) {
    return null;
  }
  const fundedShare =
    agreement.totalStroops > 0n
      ? Number((agreement.escrowedStroops * 100n) / agreement.totalStroops)
      : 0;
  const title = agreement.title || "your agreement";
  return {
    id: `fund-${agreement.id}`,
    label: "Fund escrow",
    detail:
      fundedShare === 0
        ? `Nothing funded yet for “${title}”.`
        : `“${title}” is ${Math.min(100, fundedShare)}% funded.`,
    href: `/agreements/${agreement.id}`,
    tone: "fund",
  };
}

/**
 * Per-agreement child: calls the scoped `useMilestone` hook (legal at this
 * depth) so submitted/disputed milestones pair up with the right agreement.
 */
function AgreementPending({
  agreement,
  publicKey,
}: {
  agreement: Agreement;
  publicKey: string;
}) {
  const actions: PendingAction[] = [];

  const funded = fundActionFor(agreement, publicKey);
  if (funded) actions.push(funded);

  const { milestones } = useMilestone(agreement.id);
  const isClient = publicKey === agreement.client;

  const submitted: Milestone | undefined = milestones.find(
    (m) => m.status === "submitted",
  );
  if (submitted && isClient) {
    actions.push({
      id: `approve-${agreement.id}-${submitted.index}`,
      label: "Approve submitted work",
      detail: `Milestone ${submitted.index + 1} in “${agreement.title || "your agreement"}” is awaiting your review.`,
      href: `/agreements/${agreement.id}`,
      tone: "approve",
    });
  }

  const disputed: Milestone | undefined = milestones.find(
    (m) => m.status === "disputed",
  );
  if (disputed) {
    actions.push({
      id: `dispute-${agreement.id}-${disputed.index}`,
      label: "Resolve a dispute",
      detail: `Milestone ${disputed.index + 1} in “${agreement.title || "your agreement"}” needs arbitration.`,
      href: `/agreements/${agreement.id}`,
      tone: "dispute",
    });
  }

  if (actions.length === 0) return null;

  const tones: Record<PendingAction["tone"], string> = {
    fund: "bg-accent-soft text-accent-ink",
    approve: "bg-ink text-accent",
    dispute: "bg-warn-soft text-warn",
  };
  const icons: Record<PendingAction["tone"], React.ElementType> = {
    fund: TrendingUp,
    approve: UserRound,
    dispute: ShieldAlert,
  };

  return (
    <>
      {actions.map((action) => {
        const Icon = icons[action.tone];
        return (
          <Link
            key={action.id}
            href={action.href}
            className="group flex items-center gap-3 rounded-md p-3 transition-colors hover:bg-paper"
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                tones[action.tone],
              )}
            >
              <Icon size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{action.label}</p>
              <p className="line-clamp-2 text-2xs text-muted">{action.detail}</p>
            </div>
            <ChevronRight
              size={14}
              className="shrink-0 text-line transition-colors group-hover:text-muted"
            />
          </Link>
        );
      })}
    </>
  );
}

/**
 * Things that need the signed-in wallet's attention across all agreements:
 * fund a draft, approve submitted work, or resolve a dispute.
 */
export function PendingActions({ className }: { className?: string }) {
  const { publicKey } = useWallet();
  const { agreements } = useAgreements();

  if (!publicKey || agreements.length === 0) return null;

  const parties = agreements.filter(
    (e) => e.client === publicKey || e.freelancer === publicKey,
  );
  if (parties.length === 0) return null;

  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="border-b border-line px-5 py-4">
        <p className="text-sm font-bold text-ink">Needs your attention</p>
        <p className="mt-0.5 text-xs text-muted-faint">
          Updated live from your agreements.
        </p>
      </div>

      <div className="p-2">
        {parties.map((agreement) => (
          <AgreementPending
            key={agreement.id}
            agreement={agreement}
            publicKey={publicKey}
          />
        ))}
      </div>
    </div>
  );
}