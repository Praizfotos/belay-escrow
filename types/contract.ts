import type { AgreementStatus, MilestoneStatus } from "./agreement";

export type ContractCallStatus =
  | { status: "idle" }
  | { status: "simulating" }
  | { status: "signing" }
  | { status: "sending" }
  | { status: "confirming" }
  | { status: "success"; ledger: number }
  | { status: "error"; message: string; code?: number };

export enum ContractErrorCode {
  InvalidAmount = 1,
  AmountTooLarge = 2,
  EmptyId = 3,
  IdTooLong = 4,
  TitleTooLong = 5,
  DescriptionTooLong = 6,
  EvidenceTooLong = 7,
  ReasonTooLong = 8,
  AlreadyInitialized = 9,
  NotInitialized = 10,
  InvalidActor = 11,
  AgreementExists = 12,
  AgreementNotFound = 13,
  MilestoneNotFound = 14,
  InvalidMilestoneIndex = 15,
  TooManyMilestones = 16,
  MilestoneExists = 17,
  InvalidStatus = 18,
  NotFullyFunded = 19,
  AlreadyFullyFunded = 20,
  NotDisputed = 21,
  NoArbitrator = 22,
  Unauthorized = 23,
  CannotCancel = 24,
  NotOverdue = 25,
  VersionMismatch = 26,
  InvalidPage = 27,
  IndexOverflow = 28,
  InsufficientEscrow = 29,
  SameParty = 30,
  NoMilestones = 31,
  AlreadyTerminal = 32,
}

export enum VaultErrorCode {
  AlreadyInitialized = 101,
  NotInitialized = 102,
  InvalidAmount = 103,
  InsufficientEscrow = 104,
  BalanceOverflow = 105,
  VersionMismatch = 106,
  InvalidActor = 107,
  AmountTooLarge = 108,
  TokenInUse = 109,
  IdTooLong = 110,
  EmptyId = 111,
}

export interface ContractMilestone {
  index: number;
  amountStroops: bigint;
  description: string;
  dueAt: number;
  status: MilestoneStatus;
  evidence: string;
  submittedAt: number;
  resolvedAt: number;
}

export interface ContractAgreement {
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
}

export interface GetAgreementsResult {
  agreements: ContractAgreement[];
  success: boolean;
  error?: string;
}

export interface ContractEscrowEvent {
  ledger: number;
  ledgerClosedAt: string;
  agreementId: string;
  kind:
    | "created"
    | "funded"
    | "submitted"
    | "approved"
    | "disputed"
    | "resolved"
    | "refunded"
    | "cancelled"
    | "completed";
  index?: number;
  amountStroops?: string;
  actor?: string;
  txHash?: string;
}
