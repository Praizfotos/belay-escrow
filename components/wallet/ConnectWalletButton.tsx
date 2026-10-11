"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  ChevronDown,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { Spinner } from "@/components/ui/Spinner";
import { formatAddress, formatXLM } from "@/lib/utils";
import { STELLAR_EXPLORER, type StellarNetwork } from "@/lib/utils/constants";
import { cn } from "@/lib/utils";

// ─── Network badge colour ─────────────────────────────────────────────────────

function NetworkBadge({ network }: { network: StellarNetwork | null }) {
  const isMainnet = network === "PUBLIC";
  const isUnverified = network === null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider",
        isUnverified
          ? "bg-danger-soft text-danger"
          : isMainnet
            ? "bg-paper text-ink"
            : "bg-accent-soft text-accent-ink",
      )}
    >
      <span
        className={cn(
          "h-1 w-1 rounded-full",
          isUnverified
            ? "bg-danger"
            : isMainnet
              ? "bg-ink"
              : "animate-pulse bg-accent-ink",
        )}
      />
      {isUnverified ? "Unverified" : isMainnet ? "Mainnet" : "Testnet"}
    </span>
  );
}

// ─── Dropdown menu ────────────────────────────────────────────────────────────

interface WalletDropdownProps {
  publicKey: string;
  balance: string | null;
  network: StellarNetwork | null;
  isLoadingBalance: boolean;
  onRefreshBalance: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}

function WalletDropdown({
  publicKey,
  balance,
  network,
  isLoadingBalance,
  onRefreshBalance,
  onDisconnect,
  onClose,
}: WalletDropdownProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(publicKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const explorerUrl = `${STELLAR_EXPLORER}/account/${publicKey}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="absolute right-0 top-full z-[100] mt-2 w-72 overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
    >
      {/* Header */}
      <div className="border-b border-line bg-paper px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="t-eyebrow">Connected wallet</p>
          <NetworkBadge network={network} />
        </div>

        {/* Address row */}
        <div className="flex items-center gap-2">
          <p className="flex-1 truncate font-mono text-sm font-semibold text-ink">
            {formatAddress(publicKey, 8)}
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper hover:text-ink"
            title="Copy address"
            aria-label="Copy wallet address"
          >
            {copied ? (
              <Check size={13} className="text-accent-ink" />
            ) : (
              <Copy size={13} />
            )}
          </button>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper hover:text-ink"
            title="View on Stellar Explorer"
            aria-label="View wallet on Stellar Explorer"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Balance row */}
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="t-eyebrow mb-0.5">XLM balance</p>
            {isLoadingBalance ? (
              <Spinner size={14} className="text-muted" />
            ) : (
              <p className="text-lg font-bold tracking-tight text-ink">
                {balance ? `${formatXLM(balance)} XLM` : "—"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onRefreshBalance}
            disabled={isLoadingBalance}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
            title="Refresh balance"
            aria-label="Refresh XLM balance"
          >
            <RefreshCw size={14} className={cn(isLoadingBalance && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="p-2">
        <button
          type="button"
          onClick={() => {
            onDisconnect();
            onClose();
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
        >
          <LogOut size={15} />
          Disconnect Wallet
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ConnectWalletButtonProps {
  /** Compact mode for mobile menus — shows text only, no balance */
  compact?: boolean;
  className?: string;
}

export function ConnectWalletButton({
  compact = false,
  className,
}: ConnectWalletButtonProps) {
  const {
    publicKey,
    balance,
    network,
    isConnected,
    isConnecting,
    isLoadingBalance,
    error,
    connect,
    disconnect,
    refreshBalance,
    clearError,
  } = useWallet();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Connected ──────────────────────────────────────────────────────────────

  if (isConnected && publicKey) {
    if (compact) {
      return (
        <div className={cn("flex flex-col gap-1.5", className)}>
          <div className="flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <span className="flex-1 truncate font-mono text-sm font-medium text-ink">
              {formatAddress(publicKey, 6)}
            </span>
            {balance && (
              <span className="text-xs font-semibold text-accent-ink">
                {formatXLM(balance)} XLM
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={disconnect}
            className="flex w-full items-center gap-2 rounded-md border border-danger/25 px-3 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
          >
            <LogOut size={14} />
            Disconnect
          </button>
        </div>
      );
    }

    return (
      <div ref={ref} className={cn("relative", className)}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className={cn(
            "inline-flex max-w-[180px] items-center gap-2 rounded-md border border-line bg-surface py-1.5 pl-1 pr-2 transition-colors duration-150 hover:border-muted-faint sm:max-w-none sm:pr-3",
          )}
        >
          {/* Avatar dot */}
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-accent">
            <Wallet size={13} className="text-ink" />
          </span>

          {/* Address */}
          <div className="hidden text-left sm:block">
            <p className="t-eyebrow mb-0.5 leading-none">Connected</p>
            <p className="font-mono text-xs font-semibold leading-none text-ink">
              {formatAddress(publicKey, 5)}
            </p>
          </div>

          <span className="inline-flex h-2 w-2 rounded-full bg-accent-ink sm:hidden" />

          {/* Balance pill */}
          {!isLoadingBalance && balance && (
            <span className="hidden items-center rounded-md bg-accent-soft px-2 py-0.5 text-2xs font-bold text-accent-ink sm:flex">
              {formatXLM(balance)} XLM
            </span>
          )}
          {isLoadingBalance && <Spinner size={12} className="text-muted" />}

          <ChevronDown
            size={13}
            className={cn(
              "shrink-0 text-muted-faint transition-transform duration-200",
              dropdownOpen && "rotate-180",
            )}
          />
        </button>

        <AnimatePresence>
          {dropdownOpen && (
            <WalletDropdown
              publicKey={publicKey}
              balance={balance}
              network={network}
              isLoadingBalance={isLoadingBalance}
              onRefreshBalance={refreshBalance}
              onDisconnect={disconnect}
              onClose={() => setDropdownOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="max-w-[160px] truncate text-xs text-danger">{error}</span>
        <button
          type="button"
          onClick={() => {
            clearError();
            connect();
          }}
          className="text-xs font-semibold text-ink underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Default: connect button ────────────────────────────────────────────────

  return (
    <button
      type="button"
      onClick={connect}
      disabled={isConnecting}
      className={cn(
        "inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm",
        className,
      )}
    >
      {isConnecting ? (
        <>
          <Spinner size={15} className="text-white" />
          Connecting…
        </>
      ) : (
        <>
          <Wallet size={15} />
          Connect Wallet
        </>
      )}
    </button>
  );
}
