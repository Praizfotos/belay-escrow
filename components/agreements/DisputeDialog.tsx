"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Gavel, Send } from "lucide-react";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

export type DisputeDialogMode = "dispute" | "escalate" | "resolve";

interface DisputeDialogProps {
  open: boolean;
  onClose: () => void;
  mode: DisputeDialogMode;
  /** Human-readable target, e.g. `Milestone 2`. */
  subject?: string;
  isSubmitting?: boolean;
  /** Runs for "dispute" / "escalate" modes with the entered reason. */
  onReasonSubmit?: (reason: string) => void;
  /** Runs for "resolve" mode — `true` pays the freelancer, `false` refunds the client. */
  onResolve?: (inFreelancerFavor: boolean) => void;
}

const COPY: Record<
  DisputeDialogMode,
  { title: string; description: string }
> = {
  dispute: {
    title: "Dispute milestone",
    description:
      "Explain what went wrong. The funds for this milestone stay locked in escrow while the disagreement is reviewed.",
  },
  escalate: {
    title: "Escalate to arbitration",
    description:
      "Flag the milestone for the contract's arbitrator. The tokens stay locked until they resolve it on-chain.",
  },
  resolve: {
    title: "Resolve dispute",
    description:
      "Only the contract's designated arbitrator (or the admin, if none is set) can resolve. The outcome is an on-chain transfer and cannot be undone.",
  },
};

/**
 * Dialog for milestone dispute / escalation reasons and for resolving an open
 * dispute. Backed by the shared `Modal` primitive.
 */
export function DisputeDialog({
  open,
  onClose,
  mode,
  subject,
  isSubmitting = false,
  onReasonSubmit,
  onResolve,
}: DisputeDialogProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const copy = COPY[mode];

  return (
    <Modal open={open} onClose={onClose} title={copy.title} description={copy.description}>
      {mode === "resolve" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Releasing pays the freelancer the full amount of {subject}. Refunding
            returns it to the client. Choose one.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              variant="primary"
              disabled={isSubmitting}
              onClick={() => onResolve?.(true)}
            >
              <Gavel size={15} /> Release to freelancer
            </Button>
            <Button
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => onResolve?.(false)}
            >
              <AlertTriangle size={15} /> Refund to client
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Textarea
            label="Reason"
            placeholder={
              mode === "escalate"
                ? "Why should this go to arbitration?"
                : "What was not delivered as agreed?"
            }
            value={reason}
            maxLength={240}
            disabled={isSubmitting}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
          />
          <ModalFooter>
            <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={isSubmitting}
              disabled={!!onReasonSubmit && reason.trim().length === 0}
              onClick={() => onReasonSubmit?.(reason.trim())}
            >
              <Send size={14} /> {mode === "escalate" ? "Escalate" : "Submit dispute"}
            </Button>
          </ModalFooter>
        </div>
      )}
    </Modal>
  );
}