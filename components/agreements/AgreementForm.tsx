"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Layers, ArrowRight, AlertCircle } from "lucide-react";
import type { MilestoneInput } from "@/types/agreement";
import {
  formatStroops,
  validateSchedule,
  MAX_MILESTONES,
} from "@/lib/escrow/planner";
import { useAgreements } from "@/context/AgreementContext";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MilestoneForm } from "./MilestoneForm";
import { cn } from "@/lib/utils";

function generateAgreementId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `agr-${hex}`;
}

function emptyMilestone(): MilestoneInput {
  return { index: 0, amount: "", description: "" };
}

function reindex(milestones: MilestoneInput[]): MilestoneInput[] {
  return milestones.map((m, index) => ({ ...m, index }));
}

interface AgreementFormProps {
  defaultFreelancer?: string;
  onSuccess?: (id: string) => void;
  onCancel?: () => void;
  className?: string;
}

/**
 * Create-agreement form: title, freelancer address and a milestone schedule.
 * Validates the schedule live with the same rules the on-chain
 * `add_milestone` enforces before anything is signed.
 */
export function AgreementForm({
  defaultFreelancer = "",
  onSuccess,
  onCancel,
  className,
}: AgreementFormProps) {
  const { createAgreement } = useAgreements();
  const { publicKey } = useWallet();
  const { success, error: toastError } = useToast();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [freelancer, setFreelancer] = useState(defaultFreelancer);
  const [milestones, setMilestones] = useState<MilestoneInput[]>([
    emptyMilestone(),
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const validation = validateSchedule(milestones);
  const trimmedFreelancer = freelancer.trim();
  const sameParty =
    !!publicKey && trimmedFreelancer !== "" && trimmedFreelancer === publicKey;

  const titleMissing = title.trim().length === 0;
  const freelancerMissing = trimmedFreelancer.length === 0;
  const canSubmit =
    !titleMissing && !freelancerMissing && !sameParty && validation.valid;

  const updateMilestone = (index: number, next: MilestoneInput) => {
    setMilestones((prev) =>
      reindex(prev.map((m, i) => (i === index ? next : m))),
    );
  };

  const addMilestone = () => {
    setMilestones((prev) =>
      prev.length >= MAX_MILESTONES ? prev : reindex([...prev, emptyMilestone()]),
    );
  };

  const removeMilestone = (index: number) => {
    setMilestones((prev) =>
      prev.length <= 1 ? prev : reindex(prev.filter((_, i) => i !== index)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setShowErrors(true);

    if (!publicKey) {
      setFormError("Connect your wallet before creating an agreement.");
      return;
    }
    if (titleMissing) {
      setFormError("Give the agreement a title.");
      return;
    }
    if (freelancerMissing) {
      setFormError("Enter the freelancer's Stellar address.");
      return;
    }
    if (sameParty) {
      setFormError("Client and freelancer must be different wallets.");
      return;
    }
    if (!validation.valid) {
      setFormError(validation.errors[0] ?? "The milestone schedule is invalid.");
      return;
    }

    setIsSubmitting(true);
    try {
      const agreement = await createAgreement({
        id: generateAgreementId(),
        title: title.trim(),
        client: publicKey,
        freelancer: trimmedFreelancer,
        milestones,
      });
      success(
        "Agreement created",
        "The milestones are recorded. Fund the escrow to start the work.",
      );
      if (onSuccess) onSuccess(agreement.id);
      else router.push(`/agreements/${agreement.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create the agreement.";
      setFormError(message);
      toastError("Could not create agreement", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show the contract's schedule rules as soon as the user has started
  // filling them in, or after a submit attempt — whichever comes first.
  const scheduleIssues =
    showErrors || milestones.some((m) => m.description.trim() || m.amount.trim())
      ? validation.errors
      : [];

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-6", className)}>
      <div className="card space-y-4 p-5">
        <Input
          label="Agreement title"
          placeholder="e.g. Marketing site redesign"
          value={title}
          maxLength={120}
          disabled={isSubmitting}
          onChange={(e) => setTitle(e.target.value)}
          error={showErrors && titleMissing ? "A title is required." : undefined}
          required
        />
        <Input
          label="Freelancer wallet"
          placeholder="G…"
          value={freelancer}
          disabled={isSubmitting}
          onChange={(e) => setFreelancer(e.target.value)}
          hint="The Stellar public key that will receive milestone payments."
          error={
            sameParty
              ? "Use a different wallet than your own."
              : showErrors && freelancerMissing
                ? "The freelancer's address is required."
                : undefined
          }
          className="font-mono"
          required
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-accent-ink" />
            <p className="text-sm font-semibold text-ink">Milestones</p>
          </div>
          <span className="text-xs text-muted-faint">
            {milestones.length}/{MAX_MILESTONES}
          </span>
        </div>

        <div className="space-y-3">
          {milestones.map((milestone, index) => (
            <MilestoneForm
              key={index}
              milestone={milestone}
              position={index}
              disabled={isSubmitting}
              onChange={(next) => updateMilestone(index, next)}
              onRemove={
                milestones.length > 1 ? () => removeMilestone(index) : undefined
              }
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addMilestone}
          disabled={isSubmitting || milestones.length >= MAX_MILESTONES}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-ink transition-colors hover:text-ink disabled:opacity-40"
        >
          <Plus size={13} /> Add milestone
        </button>
      </div>

      {/* Live total */}
      <div className="flex items-center justify-between rounded-lg bg-ink px-5 py-4">
        <span className="text-sm font-medium text-white/60">Total escrow amount</span>
        <span className="text-lg font-semibold tracking-tight text-accent">
          {formatStroops(validation.totalStroops)}{" "}
          <span className="text-xs font-medium text-white/50">tokens</span>
        </span>
      </div>

      {/* Live schedule validation (same rules as the contract) */}
      {scheduleIssues.length > 0 && (
        <div className="rounded-lg border border-warn/25 bg-warn-soft px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-warn" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink">
                Fix the schedule before creating
              </p>
              <ul className="mt-1 space-y-0.5">
                {scheduleIssues.slice(0, 4).map((err) => (
                  <li key={err} className="text-xs leading-relaxed text-muted">
                    {err}
                  </li>
                ))}
                {scheduleIssues.length > 4 && (
                  <li className="text-xs text-muted">
                    +{scheduleIssues.length - 4} more issue
                    {scheduleIssues.length - 4 === 1 ? "" : "s"}.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {formError && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
          <p className="text-sm font-medium text-danger">{formError}</p>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={showErrors && !canSubmit}
        >
          Create agreement <ArrowRight size={15} />
        </Button>
      </div>
      <p className="text-center text-2xs text-muted-faint sm:text-right">
        Creating writes the agreement and its milestones on-chain — your wallet
        will ask for one signature per step.
      </p>
    </form>
  );
}
