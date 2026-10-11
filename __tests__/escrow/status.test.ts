import type { AgreementStatus, MilestoneStatus } from "@/types/agreement";
import {
  agreementProgress,
  isActive,
  milestoneStatusLabel,
  statusLabel,
} from "@/lib/escrow/status";

describe("agreementProgress", () => {
  it("derives released, refunded, settled and remaining percentages", () => {
    const progress = agreementProgress({
      totalStroops: 1000n,
      releasedStroops: 250n,
      refundedStroops: 250n,
    });

    expect(progress).toEqual({
      releasedPct: 25,
      refundedPct: 25,
      settledPct: 50,
      remainingPct: 50,
    });
  });

  it("reports everything remaining when nothing has settled", () => {
    const progress = agreementProgress({
      totalStroops: 1000n,
      releasedStroops: 0n,
      refundedStroops: 0n,
    });

    expect(progress.releasedPct).toBe(0);
    expect(progress.refundedPct).toBe(0);
    expect(progress.settledPct).toBe(0);
    expect(progress.remainingPct).toBe(100);
  });

  it("returns zeros for an unfunded (zero-total) agreement", () => {
    expect(
      agreementProgress({ totalStroops: 0n, releasedStroops: 0n, refundedStroops: 0n }),
    ).toEqual({ releasedPct: 0, refundedPct: 0, settledPct: 0, remainingPct: 0 });
  });

  it("clamps when a part exceeds the total", () => {
    const progress = agreementProgress({
      totalStroops: 1000n,
      releasedStroops: 2000n,
      refundedStroops: 0n,
    });

    expect(progress.releasedPct).toBe(100);
    expect(progress.settledPct).toBe(100);
    expect(progress.remainingPct).toBe(0);
  });

  it("treats a negative amount as zero", () => {
    const progress = agreementProgress({
      totalStroops: 1000n,
      releasedStroops: -500n,
      refundedStroops: 0n,
    });

    expect(progress.releasedPct).toBe(0);
    expect(progress.remainingPct).toBe(100);
  });

  it("rounds to two decimal places", () => {
    const progress = agreementProgress({
      totalStroops: 300n,
      releasedStroops: 100n,
      refundedStroops: 0n,
    });

    expect(progress.releasedPct).toBe(33.33);
  });
});

describe("statusLabel", () => {
  it.each<[AgreementStatus, string]>([
    ["draft", "Draft"],
    ["funded", "Funded"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"],
  ])("labels %s as %s", (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });
});

describe("milestoneStatusLabel", () => {
  it.each<[MilestoneStatus, string]>([
    ["pending", "Pending"],
    ["submitted", "Submitted"],
    ["released", "Released"],
    ["refunded", "Refunded"],
    ["disputed", "Disputed"],
  ])("labels %s as %s", (status, label) => {
    expect(milestoneStatusLabel(status)).toBe(label);
  });
});

describe("isActive", () => {
  it("is true only for draft and funded agreements", () => {
    expect(isActive("draft")).toBe(true);
    expect(isActive("funded")).toBe(true);
    expect(isActive("completed")).toBe(false);
    expect(isActive("cancelled")).toBe(false);
  });
});
