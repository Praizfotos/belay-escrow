"use client";

import { useMilestones } from "@/context/MilestoneContext";
import type { UseMilestonesResult } from "@/context/MilestoneContext";

/**
 * Milestone state and per-milestone escrow actions for one agreement, backed by
 * the shared <MilestoneProvider /> store.
 */
export function useMilestone(agreementId?: string): UseMilestonesResult {
  return useMilestones(agreementId);
}
