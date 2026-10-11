"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fundAgreementOnChain,
  getContractEscrowTokenBalance,
} from "@/lib/stellar/contract";
import type { ContractActionResult } from "@/lib/stellar/contract";
import { stroopsToToken } from "@/lib/escrow/planner";
import { useWallet } from "@/hooks/useWallet";
import { logWarn, reportError } from "@/lib/observability/logger";

type EscrowFundingStep = "simulating" | "signing" | "sending" | "confirming";

export type EscrowState =
  | { status: "idle" }
  | { status: EscrowFundingStep }
  | { status: "success"; ledger: number }
  | { status: "error"; message: string };

export interface UseEscrowResult {
  /** Fund the agreement with `amountXlm` of the escrow token. */
  fund: (amountXlm: string) => Promise<ContractActionResult>;
  escrowState: EscrowState;
  reset: () => void;
  isFunding: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: string | null;
  /** Connected wallet's escrow-token balance in stroops, if it could be read. */
  tokenBalanceStroops: bigint | null;
  /** Human-formatted token balance, or null while unknown. */
  tokenBalance: string | null;
  isLoadingBalance: boolean;
  refreshBalance: () => Promise<void>;
}

const FUNDING_STEPS: readonly EscrowFundingStep[] = [
  "simulating",
  "signing",
  "sending",
  "confirming",
];

/**
 * Funding and escrow-token balance helpers for the fund UI. Funding calls
 * `fundAgreementOnChain` and then refreshes the wallet's token balance.
 */
export function useEscrow(agreementId?: string): UseEscrowResult {
  const { publicKey } = useWallet();
  const [escrowState, setEscrowState] = useState<EscrowState>({ status: "idle" });
  const [tokenBalanceStroops, setTokenBalanceStroops] = useState<bigint | null>(
    null,
  );
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!publicKey) {
      setTokenBalanceStroops(null);
      return;
    }
    setIsLoadingBalance(true);
    try {
      const result = await getContractEscrowTokenBalance(publicKey, publicKey);
      if (result.success) {
        setTokenBalanceStroops(result.balanceStroops ?? null);
      } else {
        setTokenBalanceStroops(null);
        if (result.error) {
          logWarn("escrow.balance_read_failed", {
            fields: { error: result.error },
          });
        }
      }
    } catch (err) {
      setTokenBalanceStroops(null);
      logWarn("escrow.balance_read_failed", {
        fields: { error: err instanceof Error ? err.message : String(err) },
      });
    } finally {
      setIsLoadingBalance(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const reset = useCallback(() => {
    setEscrowState({ status: "idle" });
    setError(null);
  }, []);

  const fund = useCallback(
    async (amountXlm: string): Promise<ContractActionResult> => {
      if (!publicKey) {
        const result: ContractActionResult = {
          success: false,
          error: "Wallet not connected",
        };
        setError(result.error ?? null);
        setEscrowState({
          status: "error",
          message: result.error ?? "Wallet not connected",
        });
        return result;
      }
      if (!agreementId) {
        const result: ContractActionResult = {
          success: false,
          error: "No agreement selected.",
        };
        setError(result.error ?? null);
        setEscrowState({
          status: "error",
          message: result.error ?? "No agreement selected.",
        });
        return result;
      }

      setError(null);
      setEscrowState({ status: "simulating" });

      const result = await fundAgreementOnChain({
        walletPublicKey: publicKey,
        agreementId,
        amountXlm,
        onStatus: (step) => setEscrowState({ status: step }),
      });

      if (result.success) {
        setEscrowState({ status: "success", ledger: result.ledger ?? 0 });
        void refreshBalance();
      } else {
        const message = result.error ?? "Funding failed. Please try again.";
        setEscrowState({ status: "error", message });
        setError(message);
        reportError("escrow.fund_failed", message, {
          fields: { agreementId },
        });
      }

      return result;
    },
    [publicKey, agreementId, refreshBalance],
  );

  const isFunding = FUNDING_STEPS.includes(
    escrowState.status as EscrowFundingStep,
  );

  return {
    fund,
    escrowState,
    reset,
    isFunding,
    isSuccess: escrowState.status === "success",
    isError: escrowState.status === "error",
    error,
    tokenBalanceStroops,
    tokenBalance:
      tokenBalanceStroops === null ? null : stroopsToToken(tokenBalanceStroops),
    isLoadingBalance,
    refreshBalance,
  };
}
