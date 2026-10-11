"use client";

import React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useAgreements } from "@/context/AgreementContext";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { WalletInfo } from "@/components/wallet/WalletInfo";
import { AgreementList } from "@/components/agreements/AgreementList";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
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
            href="/"
            className="text-sm font-medium text-muted hover:text-ink transition-colors"
          >
            Back to home
          </Link>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md p-8 text-center">
          <h1 className="t-h2 text-ink">Connect your wallet</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your agreements are tied to your Stellar wallet. Connect with
            Freighter to see the ones you fund and the ones you deliver.
          </p>
          <div className="mt-6">
            <ConnectWalletButton className="w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AgreementsView() {
  const { publicKey } = useWallet();
  const { agreements, isLoading, error } = useAgreements();

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader />

      <main className="container-page py-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="t-h1 text-ink">Agreements</h1>
            <p className="mt-1 text-sm text-muted">
              Every agreement your wallet is a party to — as the client funding
              the escrow, or as the freelancer delivering the work.
            </p>
          </div>
          <Button variant="primary" asChild>
            <Link href="/agreements/new">
              <Plus size={15} /> New agreement
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AgreementList
              agreements={agreements}
              publicKey={publicKey}
              isLoading={isLoading}
              error={error}
            />
          </div>
          <div className="lg:col-span-1">
            <WalletInfo className="lg:sticky lg:top-20" />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AgreementsPage() {
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
      <AgreementsView />
    </AuthGuard>
  );
}
