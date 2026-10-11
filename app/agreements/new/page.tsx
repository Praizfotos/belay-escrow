"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AgreementForm } from "@/components/agreements/AgreementForm";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { Spinner } from "@/components/ui/Spinner";
import { AppHeader } from "@/components/layout/AppHeader";

function ConnectPrompt() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="container-page flex h-14 items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-muted hover:text-ink transition-colors">
            ← Belay
          </Link>
          <Link
            href="/agreements"
            className="text-sm font-medium text-muted hover:text-ink transition-colors"
          >
            Back to agreements
          </Link>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md p-8 text-center">
          <h1 className="t-h2 text-ink">Connect your wallet</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            You create agreements as the client, so connect the wallet that
            will fund the escrow.
          </p>
          <div className="mt-6">
            <ConnectWalletButton className="w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function NewAgreementView() {
  return (
    <div className="min-h-screen bg-paper">
      <AppHeader />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href="/agreements"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          Back to agreements
        </Link>

        <div className="mb-6 mt-4">
          <h1 className="t-h1 text-ink">New agreement</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Define the work as milestones. Each milestone holds its payment in
            escrow until you approve the delivered work on-chain. Nothing is
            signed until you review the schedule below.
          </p>
        </div>

        <AgreementForm />
      </main>
    </div>
  );
}

export default function NewAgreementPage() {
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
      <NewAgreementView />
    </AuthGuard>
  );
}
