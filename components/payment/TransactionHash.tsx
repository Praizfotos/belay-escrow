"use client";

import React, { useState } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";
import { STELLAR_EXPLORER } from "@/lib/utils/constants";
import { cn } from "@/lib/utils";

interface TransactionHashProps {
  hash: string;
  className?: string;
  compact?: boolean;
}

export function TransactionHash({ hash, className, compact = false }: TransactionHashProps) {
  const [copied, setCopied] = useState(false);
  const explorerUrl = `${STELLAR_EXPLORER}/tx/${hash}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const display = compact
    ? `${hash.slice(0, 8)}…${hash.slice(-4)}`
    : `${hash.slice(0, 16)}…${hash.slice(-6)}`;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-1.5 font-mono",
        className,
      )}
    >
      <span className="text-xs text-muted">{display}</span>

      <button
        type="button"
        onClick={handleCopy}
        title="Copy transaction hash"
        aria-label="Copy transaction hash"
        className="text-muted-faint transition-colors hover:text-ink"
      >
        {copied ? (
          <Check size={12} className="text-accent-ink" />
        ) : (
          <Copy size={12} />
        )}
      </button>

      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="View on Stellar Expert"
        aria-label="View transaction on Stellar Expert"
        className="text-muted-faint transition-colors hover:text-ink"
      >
        <ExternalLink size={12} />
      </a>
    </div>
  );
}
