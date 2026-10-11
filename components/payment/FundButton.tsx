"use client";

import React, { useState } from "react";
import { Coins, CheckCircle2, AlertCircle } from "lucide-react";
import { useAgreements } from "@/context/AgreementContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { TransactionHash } from "@/components/payment/TransactionHash";
import { xlmToStroops } from "@/lib/escrow/planner";

interface FundButtonProps {
  agreementId: string;
  /** Token amount to escrow, e.g. `"250"`. */
  amount: string;
  onFunded?: () => void;
  className?: string;
  disabled?: boolean;
}

type FundState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "done"; hash?: string; ledger?: number }
  | { phase: "error"; message: string };

/**
 * Funds an agreement from the connected wallet. Persists through
 * `AgreementContext.fundAgreement` so the local list, Supabase and the
 * wallet stay in sync, and surfaces the confirmed transaction hash on success.
 */
export function FundButton({
  agreementId,
  amount,
  onFunded,
  className,
  disabled = false,
}: FundButtonProps) {
  const { fundAgreement } = useAgreements();
  const { success, error: toastError } = useToast();
  const [state, setState] = useState<FundState>({ phase: "idle" });

  const isSigning = state.phase === "signing";

  const handleFund = async () => {
    let valid = true;
    try {
      valid = xlmToStroops(amount) > 0n;
    } catch {
      valid = false;
    }
    if (!valid) {
      setState({ phase: "error", message: "Enter an amount greater than zero." });
      return;
    }

    setState({ phase: "signing" });
    try {
      const result = await fundAgreement(agreementId, amount);
      if (result.success) {
        setState({
          phase: "done",
          hash: result.hash,
          ledger: result.ledger,
        });
        success("Escrow funded", `${amount} tokens are now held in escrow.`);
        onFunded?.();
      } else {
        const message = result.error ?? "Funding failed. Please try again.";
        setState({ phase: "error", message });
        toastError("Funding failed", message);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Funding failed. Please try again.";
      setState({ phase: "error", message });
      toastError("Funding failed", message);
    }
  };

  if (state.phase === "done") {
    return (
      <div className={className}>
        <div className="flex items-start gap-2.5 rounded-md border border-accent/40 bg-accent-soft px-4 py-3">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent-ink" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-accent-ink">Escrow funded</p>
            <p className="mt-0.5 text-xs text-muted">
              {amount} tokens are locked in the contract. Both parties can see
              the funded state.
            </p>
            {state.hash && (
              <div className="mt-2">
                <TransactionHash hash={state.hash} compact />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Button
        variant="primary"
        onClick={handleFund}
        loading={isSigning}
        disabled={disabled}
        className="w-full"
      >
        <Coins size={15} />
        {isSigning ? "Confirming in Freighter…" : `Fund escrow · ${amount} tokens`}
      </Button>
      {isSigning && (
        <p className="mt-2 text-2xs leading-relaxed text-muted-faint">
          Approve the transaction in your Freighter popup, then wait for the
          Stellar network to confirm it.
        </p>
      )}
      {state.phase === "error" && (
        <div className="mt-2 flex items-start gap-1.5">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-xs font-medium text-danger">{state.message}</p>
        </div>
      )}
    </div>
  );
}
