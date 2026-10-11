"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { stellarNetworkLabel } from "@/lib/utils/constants";

export function NetworkGuardBanner() {
  const {
    isConnected,
    network,
    expectedNetwork,
    networkStatus,
    refreshNetwork,
  } = useWallet();

  if (
    !isConnected ||
    networkStatus === "idle" ||
    networkStatus === "matched"
  ) {
    return null;
  }

  const isChecking = networkStatus === "checking";
  const detail =
    networkStatus === "mismatched" && network
      ? `Your wallet is on ${stellarNetworkLabel(network)}, but Belay is configured for ${stellarNetworkLabel(expectedNetwork)}.`
      : `Belay could not verify the selected wallet's network. Switch it to ${stellarNetworkLabel(expectedNetwork)}, then check again.`;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-[100] border-b border-danger/25 bg-danger-soft px-4 py-3 text-danger shadow-sm"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Payments are blocked</p>
            <p className="mt-0.5 text-xs leading-5 text-danger/80">{detail}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refreshNetwork()}
          disabled={isChecking}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-danger/30 bg-surface px-3 py-2 text-xs font-bold text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isChecking ? "animate-spin" : ""}`} aria-hidden="true" />
          {isChecking ? "Checking network" : "Check again"}
        </button>
      </div>
    </div>
  );
}
