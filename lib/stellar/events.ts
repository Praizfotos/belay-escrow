import { rpc, xdr, scValToNative, nativeToScVal } from "@stellar/stellar-sdk";
import { sorobanServer } from "./soroban";
import { CONTRACT_ID } from "@/lib/utils/constants";
import { logWarn } from "@/lib/observability/logger";
import type { ContractEscrowEvent } from "@/types/contract";

const LOOKBACK_LEDGERS = 600;

/**
 * Maps the on-chain event topic symbols to the domain event kinds.
 *
 * `mil_add` has no dedicated kind in the frozen `ContractEscrowEvent` union, so
 * an added milestone is reported as `created`.
 */
const EVENT_KIND_BY_TOPIC: Record<string, ContractEscrowEvent["kind"]> = {
  agr_cre: "created",
  mil_add: "created",
  agr_fund: "funded",
  mil_sub: "submitted",
  mil_appr: "approved",
  mil_dsp: "disputed",
  mil_res: "resolved",
  mil_ref: "refunded",
  agr_cnc: "cancelled",
  agr_cmp: "completed",
};

function decodeTopic(value: unknown): xdr.ScVal {
  if (typeof value === "string") return xdr.ScVal.fromXDR(value, "base64");
  return value as xdr.ScVal;
}

function actorFor(
  kind: ContractEscrowEvent["kind"],
  data: Record<string, unknown>,
): string | undefined {
  switch (kind) {
    case "created":
      return data.client != null ? String(data.client) : undefined;
    case "approved":
      return data.freelancer != null ? String(data.freelancer) : undefined;
    case "disputed":
      return data.by != null ? String(data.by) : undefined;
    case "resolved":
      return data.resolver != null ? String(data.resolver) : undefined;
    default:
      return undefined;
  }
}

function amountFor(
  kind: ContractEscrowEvent["kind"],
  data: Record<string, unknown>,
): string | undefined {
  if (kind === "cancelled") {
    return data.refunded != null ? String(data.refunded) : undefined;
  }
  if (kind === "completed") {
    return data.released != null ? String(data.released) : undefined;
  }
  return data.amount != null ? String(data.amount) : undefined;
}

function toIndex(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return undefined;
}

export function parseEscrowEvent(
  raw: rpc.Api.EventResponse,
): ContractEscrowEvent | null {
  try {
    const topicScVals = Array.isArray(raw.topic) ? raw.topic : [];

    const eventName = topicScVals[0]
      ? String(scValToNative(decodeTopic(topicScVals[0])))
      : "";
    const kind = EVENT_KIND_BY_TOPIC[eventName];
    if (!kind) return null;

    const topicAgreementId = topicScVals[1]
      ? String(scValToNative(decodeTopic(topicScVals[1])))
      : "";

    const valueNative = raw.value ? scValToNative(decodeTopic(raw.value)) : null;
    const data =
      valueNative &&
      typeof valueNative === "object" &&
      !Array.isArray(valueNative)
        ? (valueNative as Record<string, unknown>)
        : {};

    const agreementId = topicAgreementId || String(data.agreement_id ?? "");
    if (!agreementId) return null;

    return {
      ledger: Number(raw.ledger ?? 0),
      ledgerClosedAt: String(raw.ledgerClosedAt ?? ""),
      agreementId,
      kind,
      index: toIndex(data.index),
      amountStroops: amountFor(kind, data),
      actor: actorFor(kind, data),
      txHash: String(raw.txHash ?? ""),
    };
  } catch {
    return null;
  }
}

export async function fetchContractEvents(
  startLedger: number,
  agreementId?: string,
): Promise<{ events: ContractEscrowEvent[]; latestLedger: number }> {
  if (!CONTRACT_ID) {
    return { events: [], latestLedger: startLedger };
  }

  try {
    let fromLedger = startLedger;

    if (!fromLedger) {
      const latest = await sorobanServer.getLatestLedger();
      fromLedger = Math.max(1, latest.sequence - LOOKBACK_LEDGERS);
    }

    const server = sorobanServer as rpc.Server;
    const agreementTopicXdr = agreementId
      ? nativeToScVal(agreementId, { type: "string" }).toXDR("base64")
      : "*";

    const response = (await server.getEvents({
      startLedger: fromLedger,
      filters: [
        {
          type: "contract",
          contractIds: [CONTRACT_ID],
          topics: [["*"], [agreementTopicXdr]],
        },
      ],
      limit: 200,
    })) as rpc.Api.GetEventsResponse;

    const latestLedger: number =
      typeof response?.latestLedger === "number" &&
      response.latestLedger > fromLedger
        ? response.latestLedger
        : fromLedger;

    const rawEvents = Array.isArray(response?.events) ? response.events : [];

    const events: ContractEscrowEvent[] = rawEvents
      .map((ev) => parseEscrowEvent(ev))
      .filter(
        (e): e is ContractEscrowEvent =>
          e !== null && (!agreementId || e.agreementId === agreementId),
      );

    return { events, latestLedger };
  } catch (err) {
    // Rethrown for the caller to handle; logged here because this is the layer
    // that knows the RPC call failed, and a sustained spike means the Soroban
    // RPC is down.
    logWarn("contract.fetch_events_failed", {
      fields: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
