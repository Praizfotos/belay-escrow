import {
  Contract,
  TransactionBuilder,
  Account,
  rpc,
  xdr,
  nativeToScVal,
  scValToNative,
  Address,
} from "@stellar/stellar-sdk";
import { sorobanServer } from "./soroban";
import { signXDR } from "@/lib/freighter";
import {
  CONTRACT_ID,
  ESCROW_TOKEN_ID,
  NETWORK_PASSPHRASE,
  HORIZON_URL,
} from "@/lib/utils/constants";
import { logWarn, reportError } from "@/lib/observability/logger";
import type { ContractMilestone } from "@/types/contract";
import { ContractErrorCode, VaultErrorCode } from "@/types/contract";
import type { MilestoneStatus } from "@/types/agreement";
import { xlmToStroops } from "@/lib/escrow/planner";

export { xlmToStroops, stroopsToXlm } from "@/lib/escrow/planner";

const SOROBAN_BASE_FEE = "1000";
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 2500;
const READ_TIMEOUT_SECONDS = 30;
const WRITE_TIMEOUT_SECONDS = 60;

export interface ContractActionResult {
  success: boolean;
  ledger?: number;
  error?: string;
  hash?: string;
}

export interface InvokeParamsBase {
  walletPublicKey: string;
  onStatus?: (
    s: "simulating" | "signing" | "sending" | "confirming",
  ) => void;
}

export function decodeContractError(raw: string): string {
  const match = raw.match(/Error\(Contract,\s*#(\d+)\)/);
  if (!match) return raw;

  const code = Number(match[1]);

  if (code >= 100) {
    switch (code) {
      case VaultErrorCode.AlreadyInitialized:
        return "Vault is already initialized.";
      case VaultErrorCode.NotInitialized:
        return "Vault contract is not initialized yet.";
      case VaultErrorCode.InvalidAmount:
        return "Vault amount must be greater than zero.";
      case VaultErrorCode.InsufficientEscrow:
        return "The vault does not hold enough escrow for this operation.";
      case VaultErrorCode.BalanceOverflow:
        return "Vault balance overflowed.";
      case VaultErrorCode.VersionMismatch:
        return "Vault storage version mismatch.";
      case VaultErrorCode.InvalidActor:
        return "Invalid vault actor for this operation.";
      case VaultErrorCode.AmountTooLarge:
        return "Vault amount is above the allowed limit.";
      case VaultErrorCode.TokenInUse:
        return "The vault token cannot be changed while funds are locked.";
      case VaultErrorCode.IdTooLong:
        return "Agreement ID is too long.";
      case VaultErrorCode.EmptyId:
        return "Agreement ID is missing.";
      default:
        return `Vault error #${code}.`;
    }
  }

  switch (code) {
    case ContractErrorCode.InvalidAmount:
      return "Amount must be greater than zero.";
    case ContractErrorCode.AmountTooLarge:
      return "Amount is above the allowed limit.";
    case ContractErrorCode.EmptyId:
      return "Agreement ID or milestone description is missing.";
    case ContractErrorCode.IdTooLong:
      return "Agreement ID is too long.";
    case ContractErrorCode.TitleTooLong:
      return "The agreement title is too long.";
    case ContractErrorCode.DescriptionTooLong:
      return "The milestone description is too long.";
    case ContractErrorCode.EvidenceTooLong:
      return "The submitted evidence is too long.";
    case ContractErrorCode.ReasonTooLong:
      return "The dispute reason is too long.";
    case ContractErrorCode.AlreadyInitialized:
      return "Contract is already initialized.";
    case ContractErrorCode.NotInitialized:
      return "Contract is not initialized yet.";
    case ContractErrorCode.InvalidActor:
      return "Invalid actor for this operation.";
    case ContractErrorCode.AgreementExists:
      return "An agreement with this ID already exists.";
    case ContractErrorCode.AgreementNotFound:
      return "Agreement not found.";
    case ContractErrorCode.MilestoneNotFound:
      return "Milestone not found.";
    case ContractErrorCode.InvalidMilestoneIndex:
      return "Invalid milestone index.";
    case ContractErrorCode.TooManyMilestones:
      return "This agreement already has the maximum number of milestones.";
    case ContractErrorCode.MilestoneExists:
      return "A milestone already exists at this index.";
    case ContractErrorCode.InvalidStatus:
      return "This action is not allowed in the current status.";
    case ContractErrorCode.NotFullyFunded:
      return "The agreement must be fully funded before milestones can be submitted.";
    case ContractErrorCode.AlreadyFullyFunded:
      return "The agreement is already fully funded.";
    case ContractErrorCode.NotDisputed:
      return "This milestone is not under dispute.";
    case ContractErrorCode.NoArbitrator:
      return "No arbitrator is configured to resolve this dispute.";
    case ContractErrorCode.Unauthorized:
      return "Authorization failed for this operation.";
    case ContractErrorCode.CannotCancel:
      return "This agreement can no longer be cancelled.";
    case ContractErrorCode.NotOverdue:
      return "This milestone is not overdue yet.";
    case ContractErrorCode.VersionMismatch:
      return "Contract storage version mismatch.";
    case ContractErrorCode.InvalidPage:
      return "The requested page is invalid.";
    case ContractErrorCode.IndexOverflow:
      return "Milestone index overflowed.";
    case ContractErrorCode.InsufficientEscrow:
      return "The contract does not hold enough escrow for this operation.";
    case ContractErrorCode.SameParty:
      return "Client and freelancer must be different accounts.";
    case ContractErrorCode.NoMilestones:
      return "Add at least one milestone before funding.";
    case ContractErrorCode.AlreadyTerminal:
      return "This agreement is already completed or cancelled.";
    default:
      return `Contract error #${code}.`;
  }
}

async function loadAccount(publicKey: string): Promise<Account> {
  const res = await fetch(
    `${HORIZON_URL}/accounts/${publicKey}?_ts=${Date.now()}`,
    { cache: "no-store", headers: { "Cache-Control": "no-cache" } },
  );
  if (!res.ok) {
    throw new Error(
      `Failed to load Stellar account (${res.status}). Verify your address is funded on testnet.`,
    );
  }
  const data = (await res.json()) as { sequence: string };
  return new Account(publicKey, data.sequence);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildContractTx(
  account: Account,
  method: string,
  args: xdr.ScVal[],
  timeoutSeconds: number,
) {
  const contract = new Contract(CONTRACT_ID);
  return new TransactionBuilder(account, {
    fee: SOROBAN_BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(timeoutSeconds)
    .build();
}

async function invoke(
  method: string,
  buildArgs: () => xdr.ScVal[],
  params: InvokeParamsBase,
  context: Record<string, unknown>,
): Promise<ContractActionResult> {
  if (!CONTRACT_ID) {
    logWarn("contract.not_configured", {
      fields: { caller: params.walletPublicKey, method },
      message:
        "CONTRACT_ID not set — skipping on-chain step. Deploy the contract and " +
        "set NEXT_PUBLIC_CONTRACT_ID.",
    });
    return { success: false, error: "Contract not configured." };
  }

  try {
    const args = buildArgs();
    const account = await loadAccount(params.walletPublicKey);
    const tx = buildContractTx(account, method, args, WRITE_TIMEOUT_SECONDS);

    params.onStatus?.("simulating");
    const simResult = await sorobanServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(decodeContractError(simResult.error));
    }
    if (!rpc.Api.isSimulationSuccess(simResult)) {
      throw new Error("Contract simulation returned an unexpected result.");
    }

    const assembled = rpc.assembleTransaction(tx, simResult).build();

    params.onStatus?.("signing");
    const signedXdr = await signXDR(assembled.toXDR(), NETWORK_PASSPHRASE);

    params.onStatus?.("sending");
    const sendResult = await sorobanServer.sendTransaction(
      TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE),
    );
    if (sendResult.status === "ERROR") {
      throw new Error(
        `Contract send failed: ${
          sendResult.errorResult?.result()?.toXDR("base64") ?? "unknown error"
        }`,
      );
    }

    params.onStatus?.("confirming");
    const hash = sendResult.hash;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      await sleep(POLL_INTERVAL_MS);
      const pollResult = await sorobanServer.getTransaction(hash);

      if (pollResult.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return {
          success: true,
          ledger: (pollResult as { ledger: number }).ledger,
          hash,
        };
      }
      if (pollResult.status === rpc.Api.GetTransactionStatus.FAILED) {
        const failed = pollResult as {
          resultXdr?: { toXDR?: () => unknown };
        };
        const rawMsg = failed.resultXdr
          ? `Contract error: ${String(failed.resultXdr)}`
          : "Contract transaction was submitted but failed on-chain.";
        throw new Error(decodeContractError(rawMsg));
      }
    }

    throw new Error("Contract transaction timed out waiting for confirmation.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Contract call failed.";
    reportError("contract.invoke_failed", err, {
      fields: { method, ...context },
    });
    return { success: false, error: message };
  }
}

export async function createAgreementOnChain(
  p: InvokeParamsBase & {
    agreementId: string;
    client: string;
    freelancer: string;
    title: string;
  },
): Promise<ContractActionResult> {
  return invoke(
    "create_agreement",
    () => [
      nativeToScVal(p.agreementId, { type: "string" }),
      new Address(p.client).toScVal(),
      new Address(p.freelancer).toScVal(),
      nativeToScVal(p.title, { type: "string" }),
    ],
    p,
    { agreementId: p.agreementId },
  );
}

export async function addMilestoneOnChain(
  p: InvokeParamsBase & {
    agreementId: string;
    index: number;
    amountXlm: string;
    description: string;
    dueAt: number;
  },
): Promise<ContractActionResult> {
  return invoke(
    "add_milestone",
    () => [
      nativeToScVal(p.agreementId, { type: "string" }),
      nativeToScVal(p.index, { type: "u32" }),
      nativeToScVal(xlmToStroops(p.amountXlm), { type: "i128" }),
      nativeToScVal(p.description, { type: "string" }),
      nativeToScVal(BigInt(Math.max(0, Math.trunc(p.dueAt))), { type: "u64" }),
    ],
    p,
    { agreementId: p.agreementId, index: p.index },
  );
}

export async function fundAgreementOnChain(
  p: InvokeParamsBase & { agreementId: string; amountXlm: string },
): Promise<ContractActionResult> {
  return invoke(
    "fund_agreement",
    () => [
      nativeToScVal(p.agreementId, { type: "string" }),
      nativeToScVal(xlmToStroops(p.amountXlm), { type: "i128" }),
    ],
    p,
    { agreementId: p.agreementId },
  );
}

export async function submitMilestoneOnChain(
  p: InvokeParamsBase & {
    agreementId: string;
    index: number;
    evidence: string;
  },
): Promise<ContractActionResult> {
  return invoke(
    "submit_milestone",
    () => [
      nativeToScVal(p.agreementId, { type: "string" }),
      nativeToScVal(p.index, { type: "u32" }),
      nativeToScVal(p.evidence, { type: "string" }),
    ],
    p,
    { agreementId: p.agreementId, index: p.index },
  );
}

export async function approveMilestoneOnChain(
  p: InvokeParamsBase & { agreementId: string; index: number },
): Promise<ContractActionResult> {
  return invoke(
    "approve_milestone",
    () => [
      nativeToScVal(p.agreementId, { type: "string" }),
      nativeToScVal(p.index, { type: "u32" }),
    ],
    p,
    { agreementId: p.agreementId, index: p.index },
  );
}

export async function disputeMilestoneOnChain(
  p: InvokeParamsBase & {
    agreementId: string;
    index: number;
    reason: string;
  },
): Promise<ContractActionResult> {
  return invoke(
    "dispute_milestone",
    () => [
      nativeToScVal(p.agreementId, { type: "string" }),
      nativeToScVal(p.index, { type: "u32" }),
      nativeToScVal(p.reason, { type: "string" }),
    ],
    p,
    { agreementId: p.agreementId, index: p.index },
  );
}

export async function escalateMilestoneOnChain(
  p: InvokeParamsBase & {
    agreementId: string;
    index: number;
    reason: string;
  },
): Promise<ContractActionResult> {
  return invoke(
    "escalate_milestone",
    () => [
      nativeToScVal(p.agreementId, { type: "string" }),
      nativeToScVal(p.index, { type: "u32" }),
      nativeToScVal(p.reason, { type: "string" }),
    ],
    p,
    { agreementId: p.agreementId, index: p.index },
  );
}

export async function resolveDisputeOnChain(
  p: InvokeParamsBase & {
    agreementId: string;
    index: number;
    inFreelancerFavor: boolean;
  },
): Promise<ContractActionResult> {
  return invoke(
    "resolve_dispute",
    () => [
      nativeToScVal(p.agreementId, { type: "string" }),
      nativeToScVal(p.index, { type: "u32" }),
      nativeToScVal(p.inFreelancerFavor, { type: "bool" }),
    ],
    p,
    { agreementId: p.agreementId, index: p.index },
  );
}

export async function refundOverdueMilestoneOnChain(
  p: InvokeParamsBase & { agreementId: string; index: number },
): Promise<ContractActionResult> {
  return invoke(
    "refund_overdue_milestone",
    () => [
      nativeToScVal(p.agreementId, { type: "string" }),
      nativeToScVal(p.index, { type: "u32" }),
    ],
    p,
    { agreementId: p.agreementId, index: p.index },
  );
}

export async function cancelAgreementOnChain(
  p: InvokeParamsBase & { agreementId: string },
): Promise<ContractActionResult> {
  return invoke(
    "cancel_agreement",
    () => [nativeToScVal(p.agreementId, { type: "string" })],
    p,
    { agreementId: p.agreementId },
  );
}

const MILESTONE_STATUSES: readonly MilestoneStatus[] = [
  "pending",
  "submitted",
  "released",
  "refunded",
  "disputed",
];

function toMilestoneStatus(value: unknown): MilestoneStatus {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if ((MILESTONE_STATUSES as readonly string[]).includes(normalized)) {
      return normalized as MilestoneStatus;
    }
  }
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < MILESTONE_STATUSES.length
  ) {
    return MILESTONE_STATUSES[value];
  }
  return "pending";
}

function toStroopsValue(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return 0n;
}

function toNumberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return 0;
}

function mapMilestone(raw: unknown): ContractMilestone {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    index: toNumberValue(r.index ?? r.idx),
    amountStroops: toStroopsValue(r.amount ?? r.amount_stroops),
    description: String(r.description ?? ""),
    dueAt: toNumberValue(r.due_at),
    status: toMilestoneStatus(r.status),
    evidence: String(r.evidence ?? ""),
    submittedAt: toNumberValue(r.submitted_at),
    resolvedAt: toNumberValue(r.resolved_at),
  };
}

export async function getContractMilestones(
  caller: string,
  agreementId: string,
): Promise<{ milestones: ContractMilestone[]; success: boolean; error?: string }> {
  if (!CONTRACT_ID) {
    return {
      milestones: [],
      success: false,
      error: "Contract not configured.",
    };
  }

  try {
    const account = await loadAccount(caller);
    const tx = buildContractTx(
      account,
      "get_milestones",
      [nativeToScVal(agreementId, { type: "string" })],
      READ_TIMEOUT_SECONDS,
    );

    const simResult = await sorobanServer.simulateTransaction(tx);
    if (
      rpc.Api.isSimulationError(simResult) ||
      !rpc.Api.isSimulationSuccess(simResult)
    ) {
      throw new Error("Simulation failed when reading agreement milestones.");
    }

    const retval = simResult.result?.retval;
    const raw = retval ? (scValToNative(retval) as unknown) : [];
    const milestones = (Array.isArray(raw) ? raw : []).map(mapMilestone);
    return { milestones, success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to read agreement milestones.";
    logWarn("contract.read_milestones_failed", {
      fields: { agreementId, error: message },
    });
    return { milestones: [], success: false, error: message };
  }
}

export async function getContractEscrowTokenBalance(
  caller: string,
  owner: string,
): Promise<{ balanceStroops: bigint | null; success: boolean; error?: string }> {
  if (!ESCROW_TOKEN_ID) {
    logWarn("contract.escrow_token_not_configured", { fields: { caller } });
    return {
      balanceStroops: null,
      success: false,
      error: "Escrow token not configured.",
    };
  }

  try {
    const account = await loadAccount(caller);
    const token = new Contract(ESCROW_TOKEN_ID);
    const tx = new TransactionBuilder(account, {
      fee: SOROBAN_BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(token.call("balance", new Address(owner).toScVal()))
      .setTimeout(READ_TIMEOUT_SECONDS)
      .build();

    const simResult = await sorobanServer.simulateTransaction(tx);
    if (
      rpc.Api.isSimulationError(simResult) ||
      !rpc.Api.isSimulationSuccess(simResult)
    ) {
      throw new Error("Simulation failed when reading escrow-token balance.");
    }

    const retval = simResult.result?.retval;
    return {
      balanceStroops: retval ? toStroopsValue(scValToNative(retval)) : 0n,
      success: true,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to read escrow-token balance.";
    logWarn("contract.read_token_balance_failed", {
      fields: { owner, error: message },
    });
    return { balanceStroops: null, success: false, error: message };
  }
}
