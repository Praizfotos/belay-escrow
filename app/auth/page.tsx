"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWalletContext } from "@/context/WalletContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { motion } from "framer-motion";
import { Wallet, User, ArrowRight, CheckCircle2, Shield, Zap } from "lucide-react";

export default function AuthPage() {
  const { signUp, signIn, isLoading } = useAuth();
  const { publicKey, isConnected, connect } = useWalletContext();
  const [displayName, setDisplayName] = useState("");
  const [isSignUpMode, setIsSignUpMode] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { success } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isSignUpMode && !displayName.trim()) {
      setError("Please enter your name");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isSignUpMode) {
        await signUp(displayName.trim());
        success("Account created successfully!");
      } else {
        await signIn();
        success("Welcome back!");
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message?: unknown }).message ?? "")
            : "";
      // Wallet already registered → auto-switch to Sign In
      if (
        isSignUpMode &&
        (message.includes("already registered") ||
          message.includes("sign in instead") ||
          message.includes("23505"))
      ) {
        setIsSignUpMode(false);
        setError("This wallet already has an account. Please sign in.");
      } else if (message) {
        setError(message);
      } else {
        setError(
          isSignUpMode ? "Sign up failed. Please try again." : "Sign in failed. Please try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="card relative w-full max-w-lg p-6 sm:p-10"
        >
          <div className="mb-8 text-center">
            <div className="t-eyebrow mb-5 inline-flex items-center gap-1.5 border-none bg-accent-soft px-3 py-1.5 text-accent-ink">
              <Shield size={13} /> Wallet authentication
            </div>
            <h1 className="t-h1 mb-3 text-ink">Welcome to Belay</h1>
            <p className="text-base leading-relaxed text-muted">
              Connect your Stellar wallet to get started
            </p>
          </div>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-paper p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-soft">
                <CheckCircle2 size={18} className="text-accent-ink" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">No passwords needed</p>
                <p className="text-xs text-muted">Your wallet is your identity</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-line bg-paper p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-soft">
                <Zap size={18} className="text-accent-ink" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">One-click sign-in</p>
                <p className="text-xs text-muted">Approve a Freighter prompt and you&apos;re in</p>
              </div>
            </div>
          </div>

          <Button
            onClick={connect}
            variant="primary"
            className="flex h-14 w-full items-center justify-center gap-2 text-base"
          >
            <Wallet size={18} />
            Connect Freighter Wallet
            <ArrowRight size={16} />
          </Button>

          <div className="mt-8 text-center">
            <p className="mb-2 text-sm text-muted">Don&apos;t have Freighter wallet?</p>
            <a
              href="https://www.freighter.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-ink transition-colors hover:text-accent-ink"
            >
              Download here
              <ArrowRight size={14} />
            </a>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="card relative w-full max-w-lg p-6 sm:p-10"
      >
        <div className="mb-8 text-center">
          <h1 className="t-h1 mb-2 text-ink">
            {isSignUpMode ? "Create account" : "Welcome back"}
          </h1>
          <p className="text-base text-muted">
            {isSignUpMode ? "Join Belay and start shipping on escrow" : "Sign in to your account"}
          </p>
        </div>

        {/* Wallet Address Display */}
        <div className="mb-6 rounded-lg border border-line bg-paper p-5">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft">
              <Wallet size={15} className="text-accent-ink" />
            </span>
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted-faint">
              Connected wallet
            </p>
          </div>
          <p className="break-all rounded-md bg-surface px-3 py-2 font-mono text-sm text-ink">
            {publicKey}
          </p>
        </div>

        {/* Toggle Sign Up / Sign In */}
        <div className="mb-6 flex gap-1 rounded-lg border border-line bg-paper p-1">
          <button
            type="button"
            onClick={() => {
              setIsSignUpMode(true);
              setError("");
            }}
            className={`flex-1 rounded-md py-2.5 text-sm font-semibold transition-colors ${
              isSignUpMode ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUpMode(false);
              setError("");
            }}
            className={`flex-1 rounded-md py-2.5 text-sm font-semibold transition-colors ${
              !isSignUpMode ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            Sign In
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {isSignUpMode && (
            <div>
              <Input
                label="Your name"
                type="text"
                placeholder="Enter your full name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setError("");
                }}
                required
              />
              <p className="mt-1.5 text-xs text-muted-faint">
                This name is stored in your profile alongside your wallet address.
              </p>
            </div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-danger/25 bg-danger-soft p-4"
            >
              <p className="text-sm font-medium text-danger">{error}</p>
            </motion.div>
          )}

          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting || isLoading}
            className="flex h-14 w-full items-center justify-center gap-2 text-base"
          >
            {isSubmitting || isLoading ? (
              "Processing…"
            ) : (
              <>
                {isSignUpMode ? "Create Account" : "Sign In"}
                <ArrowRight size={16} />
              </>
            )}
          </Button>
        </form>

        <p className="mt-8 text-center text-xs leading-relaxed text-muted">
          Your wallet address is your identity. No passwords needed.
          <br />
          {isSignUpMode ? "Already have an account?" : "New to Belay?"} Use the toggle above.
        </p>
      </motion.div>
    </div>
  );
}
