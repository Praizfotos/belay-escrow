"use client";

import React from "react";
import { RefreshCw, Wallet } from "lucide-react";
import { useEscrow } from "@/hooks/useEscrow";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

/**
 * Escrow-token balance chip for the connected wallet, scoped to one agreement.
 * Uses the frozen `useEscrow` hook so balance reads and funding share one source.
 */
export function EscrowStatus({
  agreementId,
  className,
}: {
  agreementId?: string;
  className?: string;
}) {
  const { tokenBalance, isLoadingBalance, refreshBalance } = useEscrow(agreementId);

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft">
          <Wallet size={15} className="text-accent-ink" />
        </span>
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-faint">
            Your escrow-token balance
          </p>
          {isLoadingBalance ? (
            <Spinner size={14} className="mt-0.5 text-muted" />
          ) : (
            <p className="text-sm font-bold text-ink">
              {tokenBalance ?? "—"}{" "}
              <span className="text-2xs font-semibold text-muted-faint">tokens</span>
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void refreshBalance()}
        disabled={isLoadingBalance}
        title="Refresh balance"
        aria-label="Refresh escrow-token balance"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
      >
        <RefreshCw size={14} className={cn(isLoadingBalance && "animate-spin")} />
      </button>
    </div>
  );
}
