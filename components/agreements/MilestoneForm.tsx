"use client";

import React from "react";
import { Input } from "@/components/ui/Input";
import { Trash2 } from "lucide-react";
import type { MilestoneInput } from "@/types/agreement";
import { MAX_DESCRIPTION_LENGTH } from "@/lib/escrow/planner";
import { cn } from "@/lib/utils";

interface MilestoneFormProps {
  milestone: MilestoneInput;
  /** Zero-based position, used only for labels. */
  position: number;
  onChange: (next: MilestoneInput) => void;
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
}

/** Convert a `YYYY-MM-DD` date input value to a unix-seconds timestamp. */
function dateToEpoch(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
}

/** Convert a unix-seconds timestamp back to a `YYYY-MM-DD` input value. */
function epochToDate(epoch?: number): string {
  if (!epoch) return "";
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}

/**
 * A single editable milestone row (amount, description, optional due date).
 * Presentational and controlled — the parent owns the schedule array.
 */
export function MilestoneForm({
  milestone,
  position,
  onChange,
  onRemove,
  disabled = false,
  className,
}: MilestoneFormProps) {
  const descriptionTooLong =
    milestone.description.length > MAX_DESCRIPTION_LENGTH;

  return (
    <div className={cn("rounded-lg border border-line bg-surface p-4", className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-paper text-2xs font-bold text-ink">
            {position + 1}
          </span>
          <span className="text-xs font-semibold text-muted">Milestone</span>
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove milestone ${position + 1}`}
            className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-faint transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
        <Input
          label="Deliverable"
          placeholder="e.g. Homepage design + responsive build"
          value={milestone.description}
          maxLength={MAX_DESCRIPTION_LENGTH + 40}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...milestone, description: e.target.value })
          }
          error={descriptionTooLong ? "Description is too long." : undefined}
        />
        <Input
          label="Amount"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={milestone.amount}
          disabled={disabled}
          trailing={<span className="text-2xs font-semibold text-muted-faint">tokens</span>}
          onChange={(e) => onChange({ ...milestone, amount: e.target.value })}
        />
      </div>

      <div className="mt-3 sm:max-w-[200px]">
        <Input
          label="Due date (optional)"
          type="date"
          value={epochToDate(milestone.dueAt)}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...milestone, dueAt: dateToEpoch(e.target.value) })
          }
        />
      </div>
    </div>
  );
}
