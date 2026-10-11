import type {
  AgreementStatus,
  Agreement,
  Milestone,
  MilestoneStatus,
} from "@/types/agreement";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid value for ${field}: expected non-empty string.`);
  }
  return value;
}

function asOptionalString(value: unknown, field: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Invalid value for ${field}: expected string or null.`);
  }
  return value || undefined;
}

/** Postgres `numeric` arrives as a string; the domain model uses bigint stroops. */
function asStroops(value: unknown, field: string): bigint {
  if (value == null || value === "") return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return BigInt(value.trim().split(".")[0]);
  }
  throw new Error(`Invalid value for ${field}: expected a numeric value.`);
}

function asEpoch(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    if (/^\d+$/.test(value.trim())) return Number(value.trim());
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const AGREEMENT_STATUSES: readonly AgreementStatus[] = [
  "draft",
  "funded",
  "completed",
  "cancelled",
];

function asAgreementStatus(value: unknown): AgreementStatus {
  return typeof value === "string" &&
    (AGREEMENT_STATUSES as readonly string[]).includes(value)
    ? (value as AgreementStatus)
    : "draft";
}

const MILESTONE_STATUSES: readonly MilestoneStatus[] = [
  "pending",
  "submitted",
  "released",
  "refunded",
  "disputed",
];

function asMilestoneStatus(value: unknown): MilestoneStatus {
  return typeof value === "string" &&
    (MILESTONE_STATUSES as readonly string[]).includes(value)
    ? (value as MilestoneStatus)
    : "pending";
}

export function parseAgreementRow(row: unknown): Agreement {
  if (!isRecord(row)) {
    throw new Error("Agreement row is malformed: expected object.");
  }

  return {
    id: asString(row.id, "id"),
    client: asString(row.client_wallet, "client_wallet"),
    freelancer: asString(row.freelancer_wallet, "freelancer_wallet"),
    title: asString(row.title, "title"),
    status: asAgreementStatus(row.status),
    totalStroops: asStroops(row.total_stroops, "total_stroops"),
    escrowedStroops: asStroops(row.escrowed_stroops, "escrowed_stroops"),
    releasedStroops: asStroops(row.released_stroops, "released_stroops"),
    refundedStroops: asStroops(row.refunded_stroops, "refunded_stroops"),
    milestoneCount: Number(row.milestone_count ?? 0) || 0,
    createdAt: asEpoch(row.created_at),
    fundedAt: asEpoch(row.funded_at),
    closedAt: asEpoch(row.closed_at),
  };
}

export function parseMilestoneRow(row: unknown): Milestone {
  if (!isRecord(row)) {
    throw new Error("Milestone row is malformed: expected object.");
  }

  return {
    index: Number(row.idx ?? row.index ?? 0) || 0,
    amountStroops: asStroops(row.amount_stroops, "amount_stroops"),
    description: asString(row.description, "description"),
    dueAt: asEpoch(row.due_at),
    status: asMilestoneStatus(row.status),
    evidence: asOptionalString(row.evidence, "evidence") ?? "",
    submittedAt: asEpoch(row.submitted_at),
    resolvedAt: asEpoch(row.resolved_at),
  };
}

export function parseUserRow(row: unknown): { id: string; walletAddress: string; displayName: string; createdAt: string; updatedAt: string; lastLoginAt: string } {
  if (!isRecord(row)) {
    throw new Error("User row is malformed: expected object.");
  }

  return {
    id: asString(row.id, "id"),
    walletAddress: asString(row.wallet_address, "wallet_address"),
    displayName: asString(row.display_name, "display_name"),
    createdAt: asString(row.created_at, "created_at"),
    updatedAt: asString(row.updated_at, "updated_at"),
    lastLoginAt: asString(row.last_login_at, "last_login_at"),
  };
}
