"use client";

import { useCallback } from "react";
import { useAgreements } from "@/context/AgreementContext";
import { useMilestones } from "@/context/MilestoneContext";
import type { Agreement, Milestone } from "@/types/agreement";

export interface UseAgreementResult {
  agreement: Agreement | null;
  milestones: Milestone[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * A single agreement and its milestones, backed by the shared agreement and
 * milestone stores so detail pages stay in sync with the dashboard lists.
 */
export function useAgreement(id?: string): UseAgreementResult {
  const {
    agreements,
    isLoading,
    error,
    refresh: refreshAgreements,
  } = useAgreements();
  const {
    milestones,
    isLoading: milestonesLoading,
    refresh: refreshMilestones,
  } = useMilestones(id);

  const agreement = id ? agreements.find((e) => e.id === id) ?? null : null;

  const refresh = useCallback(async () => {
    await Promise.all([refreshAgreements(), refreshMilestones()]);
  }, [refreshAgreements, refreshMilestones]);

  return {
    agreement,
    milestones,
    isLoading: isLoading || milestonesLoading,
    error,
    refresh,
  };
}
