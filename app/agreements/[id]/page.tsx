"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Send,
  Ban,
  User,
  Briefcase,
  Info,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { useAgreement } from "@/hooks/useAgreement";
import { useMilestone } from "@/hooks/useMilestone";
import { useAgreements } from "@/context/AgreementContext";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/components/ui/Toast";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Input";
import { AppHeader } from "@/components/layout/AppHeader";
import { EscrowSummary } from "@/components/agreements/EscrowSummary";
import { MilestoneList } from "@/components/agreements/MilestoneList";
import { ActivityFeed } from "@/components/agreements/ActivityFeed";
import { DisputeDialog, type DisputeDialogMode } from "@/components/agreements/DisputeDialog";
import { FundButton } from "@/components/payment/FundButton";
import { EscrowStatus } from "@/components/payment/EscrowStatus";
import { TransactionHash } from "@/components/payment/TransactionHash";
import { useContractEvents } from "@/hooks/useContractEvents";
import { stroopsToToken } from "@/lib/escrow/planner";
import { isActive, statusLabel } from "@/lib/escrow/status";
import { formatAddress } from "@/lib/utils";
import type { Agreement } from "@/types/agreement";
import type { ContractActionResult } from "@/lib/stellar/contract";

type MilestoneAction =
  | "approve"
  | "submit"
  | "dispute"
  | "escalate"
  | "refund"
  | "resolve";

const ACTION_LABEL: Record<MilestoneAction, string> = {
  approve: "Milestone released",
  submit: "Work submitted",
  dispute: "Milestone disputed",
  escalate: "Escalated",
  refund: "Milestone refunded",
  resolve: "Dispute resolved",
};

const ACTION_DETAIL: Record<MilestoneAction, (index: number) => string> = {
  approve: (index) => `Milestone ${index + 1} tokens were released to the freelancer.`,
  submit: (index) => `Milestone ${index + 1} is ready for the client's review.`,
  dispute: (index) => `Milestone ${index + 1} was flagged; its tokens stay locked.`,
  escalate: (index) => `Milestone ${index + 1} moved to arbitration.`,
  refund: (index) => `Milestone ${index + 1} tokens were refunded to the client.`,
  resolve: (index) => `The dispute on milestone ${index + 1} is settled on-chain.`,
};

// ─── "What happens next" banner ───────────────────────────────────────────────

type NextStep = {
  icon: React.ElementType;
  title: string;
  body: string;
  tone: "default" | "warn" | "done";
};

function nextStepFor(
  agreement: Agreement,
  milestones: { status: string; dueAt: number }[],
  isClient: boolean,
  isFreelancer: boolean,
): NextStep | null {
  if (agreement.status === "cancelled") {
    return {
      icon: Info,
      title: "This agreement was cancelled",
      body: "Escrowed funds were returned to the client. The on-chain record remains readable.",
      tone: "default",
    };
  }
  if (agreement.status === "completed") {
    return {
      icon: CheckCircle2,
      title: "All milestones settled",
      body: "Every milestone has been released or refunded. Nothing remains in escrow.",
      tone: "done",
    };
  }

  const disputed = milestones.find((m) => m.status === "disputed");
  if (disputed) {
    return {
      icon: AlertTriangle,
      title: "A milestone is in dispute",
      body: "Its tokens are locked in the contract. The contract's arbitrator (or the admin, if none is set) must resolve it by releasing to the freelancer or refunding the client.",
      tone: "warn",
    };
  }

  const overdue = milestones.find(
    (m) => m.status === "pending" && m.dueAt > 0 && m.dueAt * 1000 < Date.now(),
  );
  if (overdue && isClient) {
    return {
      icon: Clock,
      title: "A milestone is past its due date",
      body: "You can refund the overdue milestone back to yourself, or wait for the freelancer to submit the work.",
      tone: "warn",
    };
  }

  if (agreement.status === "draft") {
    if (isClient) {
      return {
        icon: Lock,
        title: "Fund the escrow to get started",
        body: "The agreement exists, but the escrow is empty. Fund it from the panel on the right — the freelancer won't submit work against an unfunded agreement.",
        tone: "default",
      };
    }
    return {
      icon: Clock,
      title: "Waiting for the client to fund",
      body: "Once the escrow is funded you can start submitting milestones.",
      tone: "default",
    };
  }

  // funded
  const submitted = milestones.find((m) => m.status === "submitted");
  if (submitted) {
    if (isClient) {
      return {
        icon: Send,
        title: "Work is waiting for your review",
        body: "Approve a submitted milestone to release its tokens, or dispute it if the deliverable isn't what was agreed.",
        tone: "default",
      };
    }
    return {
      icon: Clock,
      title: "The client is reviewing your submission",
      body: "Nothing to do until they approve or dispute. If the review stalls, you can escalate the milestone to arbitration.",
      tone: "default",
    };
  }

  if (isFreelancer) {
    return {
      icon: Send,
      title: "Submit your next milestone",
      body: "When a deliverable is ready, submit the milestone with a short evidence note. The client then releases its tokens.",
      tone: "default",
    };
  }

  return {
    icon: Clock,
    title: "Waiting on the freelancer",
    body: "The escrow is funded. You'll approve or dispute each milestone as the freelancer submits it.",
    tone: "default",
  };
}

function AgreementDetail({ id }: { id: string }) {
  const { agreement, milestones, isLoading, error, refresh } = useAgreement(id);
  const { cancelAgreement } = useAgreements();
  const { approve, submit, dispute, escalate, resolve, refundOverdue } =
    useMilestone(id);
  const { events, isLoading: eventsLoading, error: eventsError } =
    useContractEvents(id);
  const { publicKey } = useWallet();
  const { success, error: toastError } = useToast();

  const [pendingAction, setPendingAction] = useState<{
    index: number;
    action: MilestoneAction;
  } | null>(null);
  const [submitIndex, setSubmitIndex] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{
    index: number;
    mode: DisputeDialogMode;
  } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [lastTx, setLastTx] = useState<{ label: string; hash?: string } | null>(null);

  const runAction = async (
    index: number,
    action: MilestoneAction,
    opts: { reason?: string; inFreelancerFavor?: boolean } = {},
  ) => {
    setPendingAction({ index, action });
    try {
      const result: ContractActionResult = await (() => {
        switch (action) {
          case "approve":
            return approve(index);
          case "submit":
            return submit(index, opts.reason ?? "");
          case "dispute":
            return dispute(index, opts.reason ?? "Reviewing submitted work.");
          case "escalate":
            return escalate(index, opts.reason ?? "Escalated to arbitration.");
          case "refund":
            return refundOverdue(index);
          case "resolve":
            return resolve(index, opts.inFreelancerFavor ?? true);
        }
      })();

      if (result.success) {
        setDialog(null);
        setSubmitIndex(null);
        setEvidence("");
        setLastTx({ label: ACTION_LABEL[action], hash: result.hash });
        success(ACTION_LABEL[action], ACTION_DETAIL[action](index));
        await refresh();
      } else {
        toastError(ACTION_LABEL[action], result.error ?? undefined);
      }
    } catch (err) {
      toastError(
        ACTION_LABEL[action],
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleDialogReason = async (reason: string) => {
    if (!dialog) return;
    await runAction(
      dialog.index,
      dialog.mode === "escalate" ? "escalate" : "dispute",
      { reason },
    );
  };

  const handleDialogResolve = async (inFreelancerFavor: boolean) => {
    if (!dialog || dialog.mode !== "resolve") return;
    await runAction(dialog.index, "resolve", { inFreelancerFavor });
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      const result = await cancelAgreement(id);
      if (result.success) {
        setCancelOpen(false);
        setLastTx({ label: "Agreement cancelled", hash: result.hash });
        success("Agreement cancelled", "Escrow refunds were handled on-chain.");
        await refresh();
      } else {
        toastError("Cancel failed", result.error ?? undefined);
      }
    } catch (err) {
      toastError("Cancel failed", err instanceof Error ? err.message : undefined);
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading && !agreement) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Spinner size={28} className="text-muted" />
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="card-flat w-full max-w-md p-10 text-center">
          <Info size={22} className="mx-auto mb-3 text-muted-faint" />
          <p className="t-h3 text-ink">Agreement not found</p>
          <p className="mt-1.5 text-sm text-muted">
            It may have been removed, or your wallet may not be a party to it.
          </p>
          <Link
            href="/agreements"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft transition-colors"
          >
            <ArrowLeft size={14} /> Back to agreements
          </Link>
        </div>
      </div>
    );
  }

  const isClient = !!publicKey && publicKey === agreement.client;
  const isFreelancer = !!publicKey && publicKey === agreement.freelancer;
  const active = isActive(agreement.status);

  const remaining = agreement.totalStroops - agreement.escrowedStroops;
  const remainingTokens = remaining > 0n ? stroopsToToken(remaining) : null;
  const pendingIndex = pendingAction?.index ?? null;

  const step = nextStepFor(agreement, milestones, isClient, isFreelancer);

  const stepToneClasses = step
    ? step.tone === "warn"
      ? "border-warn/25 bg-warn-soft"
      : step.tone === "done"
        ? "border-accent/40 bg-accent-soft"
        : "border-line bg-surface"
    : "";

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader />

      <main className="container-page py-6 sm:py-8">
        {/* Header */}
        <div className="mb-4">
          <Link
            href="/agreements"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} /> Agreements
          </Link>
        </div>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  agreement.status === "completed"
                    ? "lime"
                    : agreement.status === "funded"
                      ? "solid"
                      : agreement.status === "cancelled"
                        ? "danger"
                        : "outline"
                }
              >
                {statusLabel(agreement.status)}
              </Badge>
              {isClient && (
                <span className="rounded-full bg-paper px-2.5 py-0.5 text-2xs font-semibold text-muted">
                  You&apos;re the client
                </span>
              )}
              {isFreelancer && (
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-2xs font-semibold text-accent-ink">
                  You&apos;re the freelancer
                </span>
              )}
            </div>
            <h1 className="t-h1 mt-2 break-words text-ink">
              {agreement.title || "Untitled agreement"}
            </h1>
            <p className="mt-1 font-mono text-2xs text-muted-faint">{agreement.id}</p>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <User size={12} /> Client:{" "}
                <span className="font-mono font-semibold text-ink">
                  {formatAddress(agreement.client, 6) || "—"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Briefcase size={12} /> Freelancer:{" "}
                <span className="font-mono font-semibold text-ink">
                  {formatAddress(agreement.freelancer, 6) || "—"}
                </span>
              </span>
            </div>
          </div>

          {isClient && active && (
            <Button
              variant="secondary"
              onClick={() => setCancelOpen(true)}
              disabled={!!pendingIndex}
            >
              <Ban size={14} /> Cancel agreement
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3">
            <p className="text-xs font-medium text-warn">
              {error} — showing cached data.
            </p>
          </div>
        )}

        {/* What happens next */}
        {step && (
          <div className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3.5 ${stepToneClasses}`}>
            <step.icon size={16} className="mt-0.5 shrink-0 text-ink" />
            <div>
              <p className="text-sm font-semibold text-ink">{step.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{step.body}</p>
            </div>
          </div>
        )}

        {/* Last transaction feedback */}
        {lastTx && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
            <CheckCircle2 size={15} className="shrink-0 text-accent-ink" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Last action: {lastTx.label}</p>
              <p className="text-2xs text-muted-faint">
                Confirmed on the Stellar network
                {lastTx.hash ? " — open the transaction to verify:" : "."}
              </p>
            </div>
            {lastTx.hash && <TransactionHash hash={lastTx.hash} compact />}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: milestones + activity */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <p className="t-eyebrow mb-2.5">Milestones</p>
              <MilestoneList
                agreement={agreement}
                milestones={milestones}
                publicKey={publicKey}
                pendingIndex={pendingIndex}
                handlers={{
                  onSubmit: (index) => {
                    setSubmitIndex(index);
                    setEvidence("");
                  },
                  onApprove: (index) => void runAction(index, "approve"),
                  onDispute: (index) => setDialog({ index, mode: "dispute" }),
                  onEscalate: (index) => setDialog({ index, mode: "escalate" }),
                  onResolve: (index) => setDialog({ index, mode: "resolve" }),
                  onRefund: (index) => void runAction(index, "refund"),
                }}
              />
            </div>

            <ActivityFeed events={events} isLoading={eventsLoading} error={eventsError} />
          </div>

          {/* Right: escrow + funding */}
          <div className="space-y-4">
            <EscrowSummary agreement={agreement} />

            <EscrowStatus agreementId={id} />

            {isClient && agreement.status === "draft" && remainingTokens && (
              <div className="card p-4">
                <p className="t-eyebrow mb-3">Fund escrow</p>
                <FundButton
                  agreementId={id}
                  amount={remainingTokens}
                  onFunded={() => void refresh()}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Submit-work dialog */}
      <Modal
        open={submitIndex !== null}
        onClose={() => setSubmitIndex(null)}
        title="Submit work"
        description={`Attach evidence for milestone ${(submitIndex ?? 0) + 1}. The client reviews it and releases the escrowed tokens.`}
      >
        <div className="space-y-4">
          <Textarea
            label="Evidence"
            placeholder="e.g. links to deliverables, screenshots, or a handover note…"
            value={evidence}
            maxLength={240}
            rows={4}
            onChange={(e) => setEvidence(e.target.value)}
          />
          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={() => setSubmitIndex(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={!!pendingIndex}
              disabled={evidence.trim().length === 0}
              onClick={() => {
                const index = submitIndex;
                if (index !== null) void runAction(index, "submit", { reason: evidence });
              }}
            >
              <Send size={14} /> Submit
            </Button>
          </div>
        </div>
      </Modal>

      {/* Dispute / escalate / resolve dialog */}
      <DisputeDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        mode={dialog?.mode ?? "dispute"}
        subject={dialog ? `milestone ${dialog.index + 1}` : undefined}
        isSubmitting={!!pendingIndex}
        onReasonSubmit={handleDialogReason}
        onResolve={handleDialogResolve}
      />

      {/* Cancel confirmation */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel agreement?"
        description="Pending milestones can be refunded and all escrowed funds are returned to you on-chain. This cannot be undone."
      >
        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" disabled={isCancelling} onClick={() => setCancelOpen(false)}>
            Keep agreement
          </Button>
          <Button variant="destructive" loading={isCancelling} onClick={() => void handleCancel()}>
            Cancel agreement
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default function AgreementDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ? decodeURIComponent(params.id) : "";
  const { isConnected, isConnecting } = useWallet();

  if (isConnecting || !isConnected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Spinner size={28} className="text-muted" />
      </div>
    );
  }

  return (
    <AuthGuard>
      <AgreementDetail id={id} />
    </AuthGuard>
  );
}
