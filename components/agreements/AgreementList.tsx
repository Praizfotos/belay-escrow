"use client";

import React from "react";
import Link from "next/link";
import { Plus, Inbox, AlertCircle } from "lucide-react";
import type { Agreement, AgreementStatus } from "@/types/agreement";
import { AgreementCard } from "./AgreementCard";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

interface AgreementListProps {
  agreements: Agreement[];
  publicKey?: string | null;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

const STATUS_ORDER: AgreementStatus[] = ["funded", "draft", "completed", "cancelled"];

const STATUS_TITLES: Record<AgreementStatus, string> = {
  funded: "In progress",
  draft: "Draft — not funded",
  completed: "Completed",
  cancelled: "Cancelled",
};

function RoleGroup({
  title,
  agreements,
  publicKey,
}: {
  title: string;
  agreements: Agreement[];
  publicKey?: string | null;
}) {
  if (agreements.length === 0) return null;

  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        <p className="t-eyebrow">{title}</p>
        <span className="text-2xs font-medium text-muted-faint">· {agreements.length}</span>
      </div>
      <div className="space-y-4">
        {STATUS_ORDER.map((status) => {
          const items = agreements.filter((a) => a.status === status);
          if (items.length === 0) return null;
          return (
            <div key={status}>
              <p className="mb-2 text-xs font-medium text-muted">
                {STATUS_TITLES[status]} · {items.length}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((agreement) => (
                  <AgreementCard
                    key={agreement.id}
                    agreement={agreement}
                    publicKey={publicKey}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The connected wallet's agreements, split into the ones it hired for and the
 * ones it is delivering, then grouped by status within each role.
 */
export function AgreementList({
  agreements,
  publicKey,
  isLoading = false,
  error = null,
  className,
}: AgreementListProps) {
  if (isLoading && agreements.length === 0) {
    return (
      <div className={cn("flex items-center justify-center py-16", className)}>
        <Spinner size={24} className="text-muted" />
      </div>
    );
  }

  if (error && agreements.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-danger/30 bg-danger-soft p-6 text-center",
          className
        )}
      >
        <AlertCircle size={18} className="mx-auto mb-2 text-danger" />
        <p className="text-sm font-semibold text-danger">Could not load agreements</p>
        <p className="mt-1 text-xs text-danger/80">{error}</p>
      </div>
    );
  }

  if (agreements.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-line bg-surface p-10 text-center",
          className
        )}
      >
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-paper">
          <Inbox size={18} className="text-muted-faint" />
        </div>
        <p className="text-sm font-semibold text-ink">No agreements yet</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Create an agreement and fund its escrow to get started — or ask your
          counterparty to send you one.
        </p>
        <Link
          href="/agreements/new"
          className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-ink-soft transition-colors"
        >
          <Plus size={12} /> New agreement
        </Link>
      </div>
    );
  }

  const asClient = publicKey ? agreements.filter((a) => a.client === publicKey) : [];
  const asFreelancer = publicKey ? agreements.filter((a) => a.freelancer === publicKey) : [];
  const known = new Set([...asClient, ...asFreelancer]);
  const other = agreements.filter((a) => !known.has(a));

  if (asClient.length === 0 && asFreelancer.length === 0) {
    return (
      <RoleGroup title="All agreements" agreements={agreements} publicKey={publicKey} />
    );
  }

  return (
    <div className={cn("space-y-8", className)}>
      <RoleGroup title="As client" agreements={asClient} publicKey={publicKey} />
      <RoleGroup title="As freelancer" agreements={asFreelancer} publicKey={publicKey} />
      {other.length > 0 && (
        <RoleGroup title="Other" agreements={other} publicKey={publicKey} />
      )}
    </div>
  );
}
