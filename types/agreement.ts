export type AgreementStatus = "draft" | "funded" | "completed" | "cancelled";

export type MilestoneStatus =
  | "pending"
  | "submitted"
  | "released"
  | "refunded"
  | "disputed";

export interface Milestone {
  index: number;
  amountStroops: bigint;
  description: string;
  dueAt: number;
  status: MilestoneStatus;
  evidence: string;
  submittedAt: number;
  resolvedAt: number;
}

export interface Agreement {
  id: string;
  client: string;
  freelancer: string;
  title: string;
  status: AgreementStatus;
  totalStroops: bigint;
  escrowedStroops: bigint;
  releasedStroops: bigint;
  refundedStroops: bigint;
  milestoneCount: number;
  createdAt: number;
  fundedAt: number;
  closedAt: number;
  milestones?: Milestone[];
}

export interface MilestoneInput {
  index: number;
  amount: string;
  description: string;
  dueAt?: number;
}

export interface CreateAgreementInput {
  id: string;
  title: string;
  client: string;
  freelancer: string;
  milestones: MilestoneInput[];
}
