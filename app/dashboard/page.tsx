"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus,
  Inbox,
  Coins,
  TrendingUp,
  FileSignature,
  ArrowRight,
  Wallet,
  Briefcase,
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/context/AuthContext";
import { useAgreements } from "@/context/AgreementContext";
import { useEscrow } from "@/hooks/useEscrow";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { WalletInfo } from "@/components/wallet/WalletInfo";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { AppHeader } from "@/components/layout/AppHeader";
import { AgreementCard } from "@/components/agreements/AgreementCard";
import { PendingActions } from "@/components/dashboard/PendingActions";
import { formatStroops } from "@/lib/escrow/planner";
import { formatAddress, cn } from "@/lib/utils";
import type { Agreement, AgreementStatus } from "@/types/agreement";

// ─── Not-connected view ───────────────────────────────────────────────────────

function ConnectPrompt() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="container-page flex h-14 items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-muted hover:text-ink transition-colors">
            ← Belay
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-muted hover:text-ink transition-colors"
          >
            Back to home
          </Link>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="card w-full max-w-md p-8"
        >
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md bg-paper">
            <Wallet size={18} className="text-accent-ink" />
          </div>
          <h1 className="t-h2 text-ink">Connect your wallet</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Belay uses the{" "}
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-ink underline underline-offset-2"
            >
              Freighter
            </a>{" "}
            browser wallet to sign Stellar escrow transactions. No account or
            password needed — your keys stay in your wallet.
          </p>
          <div className="mt-6">
            <ConnectWalletButton className="w-full" />
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-line pt-5 text-center">
            {[
              ["Non-custodial", "keys stay local"],
              ["On-chain escrow", "Soroban contract"],
              ["Testnet", "free to try"],
            ].map(([label, sub]) => (
              <div key={label}>
                <p className="text-xs font-semibold text-ink">{label}</p>
                <p className="mt-0.5 text-2xs text-muted-faint">{sub}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Small building blocks ────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        accent ? "border-transparent bg-ink" : "border-line bg-surface"
      )}
    >
      <Icon size={14} className={accent ? "mb-2 text-accent" : "mb-2 text-muted-faint"} />
      <p className={cn("text-xl font-semibold tracking-tight", accent ? "text-white" : "text-ink")}>
        {value}
      </p>
      <p className={cn("mt-0.5 text-xs font-medium", accent ? "text-white/55" : "text-muted")}>
        {label}
      </p>
      {sub && (
        <p className={cn("mt-0.5 text-2xs", accent ? "text-white/40" : "text-muted-faint")}>
          {sub}
        </p>
      )}
    </div>
  );
}

const STATUS_ORDER: AgreementStatus[] = ["funded", "draft", "completed", "cancelled"];

function RoleSection({
  title,
  icon: Icon,
  agreements,
  publicKey,
}: {
  title: string;
  icon: React.ElementType;
  agreements: Agreement[];
  publicKey: string | null;
}) {
  if (agreements.length === 0) return null;

  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    items: agreements.filter((a) => a.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-muted" />
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <span className="rounded-full bg-paper px-2 py-0.5 text-2xs font-semibold text-muted">
            {agreements.length}
          </span>
        </div>
      </div>
      <div className="divide-y divide-line">
        {byStatus.map((group) => (
          <div key={group.status} className="px-5 py-3.5">
            <p className="t-eyebrow mb-2.5">
              {group.status === "funded"
                ? "In progress"
                : group.status === "draft"
                  ? "Draft — not funded"
                  : group.status === "completed"
                    ? "Completed"
                    : "Cancelled"}
              {" · "}
              {group.items.length}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.items.map((agreement) => (
                <AgreementCard key={agreement.id} agreement={agreement} publicKey={publicKey} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Connected dashboard view ─────────────────────────────────────────────────

function DashboardView() {
  const { publicKey, network } = useWallet();
  const { user } = useAuth();
  const { agreements, isLoading } = useAgreements();
  const { tokenBalance, isLoadingBalance, refreshBalance } = useEscrow();

  const asClient = agreements.filter((a) => a.client === publicKey);
  const asFreelancer = agreements.filter((a) => a.freelancer === publicKey);

  const totalEscrowed = agreements.reduce((s, a) => s + a.escrowedStroops, 0n);
  const totalReleased = agreements.reduce((s, a) => s + a.releasedStroops, 0n);
  const totalRefunded = agreements.reduce((s, a) => s + a.refundedStroops, 0n);
  // Still locked = escrowed minus whatever has already left the vault.
  const stillLocked =
    totalEscrowed - totalReleased - totalRefunded > 0n
      ? totalEscrowed - totalReleased - totalRefunded
      : 0n;

  const active = agreements.filter((a) => a.status === "draft" || a.status === "funded");
  const completed = agreements.filter((a) => a.status === "completed");

  const networkLabel =
    network === "PUBLIC" ? "Stellar Mainnet" : network === "TESTNET" ? "Stellar Testnet" : "Network unknown";

  const empty = agreements.length === 0;

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader />

      <main className="container-page py-6 sm:py-8">
        {/* Welcome row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-6 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <p className="t-eyebrow">{networkLabel}</p>
            <h1 className="t-h1 mt-1 text-ink">
              {user?.displayName ? `Welcome back, ${user.displayName}` : "Dashboard"}
            </h1>
            <p className="mt-1 font-mono text-xs text-muted-faint">
              {publicKey ? formatAddress(publicKey, 10) : "—"}
            </p>
          </div>
          <Button variant="primary" asChild>
            <Link href="/agreements/new">
              <Plus size={15} /> New agreement
            </Link>
          </Button>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <PendingActions />

            {/* Derived stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={FileSignature}
                label="Agreements"
                value={isLoading && empty ? "…" : agreements.length}
                sub={`${active.length} active · ${completed.length} done`}
              />
              <StatCard
                icon={Briefcase}
                label="As client"
                value={isLoading && empty ? "…" : asClient.length}
                sub="you fund & approve"
              />
              <StatCard
                icon={Coins}
                label="Still in escrow"
                value={stillLocked > 0n ? formatStroops(stillLocked) : "0"}
                sub="tokens held by the contract"
                accent
              />
              <StatCard
                icon={TrendingUp}
                label="Released"
                value={totalReleased > 0n ? formatStroops(totalReleased) : "0"}
                sub={`to freelancers · ${asFreelancer.length} as freelancer`}
              />
            </div>

            {empty ? (
              <div className="card-flat border-dashed p-10 text-center">
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-paper">
                  <Inbox size={18} className="text-muted-faint" />
                </div>
                <h2 className="t-h3 text-ink">No agreements yet</h2>
                <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
                  An agreement defines the milestones and the escrow. Create one
                  as the client, or ask your counterparty to invite you as the
                  freelancer.
                </p>
                <div className="mt-6 flex justify-center gap-2">
                  <Button variant="primary" asChild>
                    <Link href="/agreements/new">
                      <Plus size={15} /> Create an agreement
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <RoleSection
                  title="As client"
                  icon={Briefcase}
                  agreements={asClient}
                  publicKey={publicKey}
                />
                <RoleSection
                  title="As freelancer"
                  icon={FileSignature}
                  agreements={asFreelancer}
                  publicKey={publicKey}
                />
                {asClient.length === 0 && asFreelancer.length > 0 && (
                  <p className="text-xs text-muted-faint">
                    You are only listed as a freelancer on these agreements.
                  </p>
                )}
              </>
            )}

            {!empty && (
              <div className="flex justify-end">
                <Link
                  href="/agreements"
                  className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink transition-colors"
                >
                  View all agreements <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>

          {/* Right rail: wallet + escrow token balance */}
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="t-eyebrow">Escrow token balance</p>
                  {isLoadingBalance ? (
                    <Spinner size={16} className="mt-2 text-muted" />
                  ) : (
                    <p className="mt-1 text-xl font-semibold tracking-tight text-ink">
                      {tokenBalance ?? "—"}{" "}
                      <span className="text-xs font-medium text-muted-faint">tokens</span>
                    </p>
                  )}
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft">
                  <Wallet size={15} className="text-accent-ink" />
                </div>
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-muted-faint">
                The escrow-token balance of your connected wallet, read on-chain.
                Fund agreements from this balance.
              </p>
              <button
                type="button"
                onClick={() => void refreshBalance()}
                disabled={isLoadingBalance}
                className="mt-3 text-xs font-medium text-muted hover:text-ink transition-colors disabled:opacity-50"
              >
                Refresh balance
              </button>
            </div>

            <WalletInfo />
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { isConnected, isConnecting } = useWallet();

  if (isConnecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Spinner size={28} className="text-muted" />
      </div>
    );
  }

  if (!isConnected) {
    return <ConnectPrompt />;
  }

  return (
    <AuthGuard>
      <DashboardView />
    </AuthGuard>
  );
}
