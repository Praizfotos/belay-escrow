"use client";

import React, { useState } from "react";
import { Copy, Check, RefreshCw, ExternalLink, LogOut } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { Spinner } from "@/components/ui/Spinner";
import { formatAddress, formatXLM } from "@/lib/utils";
import { STELLAR_EXPLORER } from "@/lib/utils/constants";
import { cn } from "@/lib/utils";

/**
 * Full wallet info panel — intended for the dashboard sidebar or page header.
 * Shows: address, network, balance, copy/explorer/refresh/disconnect actions.
 */
export function WalletInfo({ className }: { className?: string }) {
  const {
    publicKey,
    balance,
    network,
    isConnected,
    isLoadingBalance,
    refreshBalance,
    disconnect,
  } = useWallet();

  const [copied, setCopied] = useState(false);

  if (!isConnected || !publicKey) return null;

  const explorerUrl = `${STELLAR_EXPLORER}/account/${publicKey}`;
  const isMainnet = network === "PUBLIC";
  const isUnverified = network === null;

  const handleCopy = () => {
    navigator.clipboard.writeText(publicKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={cn("card overflow-hidden", className)}>
      {/* Network bar */}
      <div
        className={cn(
          "flex items-center gap-2 border-b border-line px-4 py-2 text-xs font-semibold",
          isUnverified
            ? "bg-danger-soft text-danger"
            : isMainnet
              ? "bg-paper text-ink"
              : "bg-accent-soft text-accent-ink",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isUnverified
              ? "bg-danger"
              : isMainnet
                ? "bg-ink"
                : "animate-pulse bg-accent-ink",
          )}
        />
        {isUnverified
          ? "Stellar network unverified"
          : isMainnet
            ? "Stellar Mainnet"
            : "Stellar Testnet"}
      </div>

      <div className="p-4 sm:p-5">
        {/* Address */}
        <div className="mb-4">
          <p className="t-eyebrow mb-1">Wallet address</p>
          <p className="break-all font-mono text-sm font-semibold text-ink">{publicKey}</p>
          <p className="mt-0.5 font-mono text-xs text-muted">{formatAddress(publicKey, 10)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-sm px-1 py-1 text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              {copied ? (
                <Check size={12} className="text-accent-ink" />
              ) : (
                <Copy size={12} />
              )}
              {copied ? "Copied!" : "Copy address"}
            </button>
            <span className="text-line">·</span>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm px-1 py-1 text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              <ExternalLink size={12} />
              View on Explorer
            </a>
          </div>
        </div>

        {/* Balance */}
        <div className="mb-3 rounded-lg border border-line bg-paper p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="t-eyebrow mb-1">XLM balance</p>
              {isLoadingBalance ? (
                <Spinner size={16} className="text-muted" />
              ) : (
                <p className="text-2xl font-bold tracking-tight text-ink">
                  {balance ? `${formatXLM(balance)}` : "—"}{" "}
                  <span className="text-sm font-semibold text-muted">XLM</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={refreshBalance}
              disabled={isLoadingBalance}
              title="Refresh balance"
              aria-label="Refresh XLM balance"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
            >
              <RefreshCw size={14} className={cn(isLoadingBalance && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Disconnect */}
        <button
          type="button"
          onClick={disconnect}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-danger/25 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
        >
          <LogOut size={14} />
          Disconnect Wallet
        </button>
      </div>
    </div>
  );
}
