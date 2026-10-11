"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { ShieldAlert } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Protects routes by requiring authentication.
 * Redirects to /auth if user is not authenticated.
 *
 * `isAuthenticated` is derived from the verified session token, not from cached
 * localStorage state, so forging `belay:user` / `belay:publicKey` does not
 * get past this guard. It is defence in depth either way: RLS rejects every
 * request that lacks a server-signed `wallet_address` claim, so bypassing the
 * guard in the client would still yield an app with no data.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, user, sessionError, refreshSession } = useAuth();
  const [isRetrying, setIsRetrying] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !sessionError && !isAuthenticated) {
      router.push("/auth");
    }
  }, [isAuthenticated, isLoading, sessionError, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="text-center">
          <Spinner size={48} className="text-muted" />
          <p className="mt-4 text-sm text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  // The wallet never proved key ownership, so every database call would be
  // rejected. Ask for a signature rather than showing a half-working app.
  if (sessionError) {
    const retry = async () => {
      setIsRetrying(true);
      try {
        await refreshSession();
      } finally {
        setIsRetrying(false);
      }
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="card-flat w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-danger-soft">
            <ShieldAlert size={24} className="text-danger" />
          </div>
          <h1 className="t-h3 mb-2 text-ink">Verify your wallet</h1>
          <p className="mb-6 text-sm leading-relaxed text-muted">
            Belay needs a signature from your wallet to prove you own this
            address. Nothing is submitted to the network and no fee is charged.
          </p>
          <p className="mb-6 break-words rounded-md bg-paper px-4 py-3 text-xs text-muted">
            {sessionError}
          </p>
          <Button
            variant="primary"
            onClick={retry}
            loading={isRetrying}
            className="h-12 w-full"
          >
            {isRetrying ? "Waiting for your wallet…" : "Sign to continue"}
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect in useEffect
  }

  return <>{children}</>;
}
