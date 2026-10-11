"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Milestone, MilestoneStatus } from "@/types/agreement";
import type { ContractActionResult } from "@/lib/stellar/contract";
import {
  approveMilestoneOnChain,
  disputeMilestoneOnChain,
  escalateMilestoneOnChain,
  refundOverdueMilestoneOnChain,
  resolveDisputeOnChain,
  submitMilestoneOnChain,
} from "@/lib/stellar/contract";
import { getWalletScopedKey } from "@/lib/utils/constants";
import {
  getAuthenticatedClient,
  onSessionChange,
  readStoredSession,
} from "@/lib/supabase/session";
import type {
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import { useWalletContext } from "./WalletContext";
import { logWarn, reportError } from "@/lib/observability/logger";
import { supabaseErrorFields } from "@/lib/observability/supabaseError";
import { userFacingMessage } from "@/lib/errors/userMessage";

/** Wallet-scoped offline cache for milestone rows (bigint-safe). */
export const LS_MILESTONES_CACHE = "belay:milestones";

/**
 * True only when this browser holds an unexpired session token minted for this
 * exact wallet — i.e. the wallet has signed a server challenge at some point.
 * Possession of an address alone must not unlock the offline cache.
 */
function hasProvenOwnership(walletAddress: string | null): boolean {
  if (!walletAddress) return false;
  try {
    return !!readStoredSession(walletAddress);
  } catch {
    return false;
  }
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

function toStroopsValue(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    try {
      return BigInt(value.trim().split(".")[0]);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function toEpoch(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    if (/^\d+$/.test(value.trim())) return Number(value.trim());
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function dbRowToMilestone(row: unknown): Milestone {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    index: Number(r.idx ?? r.index ?? 0) || 0,
    amountStroops: toStroopsValue(r.amount_stroops),
    description: String(r.description ?? ""),
    dueAt: toEpoch(r.due_at),
    status: asMilestoneStatus(r.status),
    evidence: String(r.evidence ?? ""),
    submittedAt: toEpoch(r.submitted_at),
    resolvedAt: toEpoch(r.resolved_at),
  };
}

/**
 * The `milestones` row shape Supabase returns over REST and realtime.
 * Declared as a type alias (not an interface) so it satisfies the
 * `{ [key: string]: any }` constraint of `RealtimePostgresChangesPayload`
 * without falling back to `any` at the call sites.
 */
type MilestoneDbRow = {
  agreement_id?: string | null;
  idx?: number | null;
  index?: number | null;
  amount_stroops?: string | number | null;
  description?: string | null;
  due_at?: string | number | null;
  status?: string | null;
  evidence?: string | null;
  submitted_at?: string | number | null;
  resolved_at?: string | number | null;
  tx_hash?: string | null;
  updated_at?: string | number | null;
};

interface MilestoneRecord {
  agreementId: string;
  milestone: Milestone;
}

function recordKey(record: MilestoneRecord): string {
  return `${record.agreementId}:${record.milestone.index}`;
}

/**
 * JSON has no bigint and `amountStroops` is one, so the cache round-trips each
 * value through a tagged wrapper instead of corrupting it to a string.
 */
function serializeRecords(records: MilestoneRecord[]): string {
  return JSON.stringify(records, (_key, value) =>
    typeof value === "bigint" ? { $bigint: value.toString() } : value,
  );
}

function deserializeRecords(raw: string): MilestoneRecord[] {
  return JSON.parse(raw, (_key, value) =>
    value &&
    typeof value === "object" &&
    typeof (value as { $bigint?: unknown }).$bigint === "string"
      ? BigInt((value as { $bigint: string }).$bigint)
      : value,
  ) as MilestoneRecord[];
}

function groupRecords(
  records: MilestoneRecord[],
): Record<string, Milestone[]> {
  const grouped: Record<string, Milestone[]> = {};
  for (const record of records) {
    const bucket = grouped[record.agreementId] ?? [];
    bucket.push(record.milestone);
    grouped[record.agreementId] = bucket;
  }
  for (const bucket of Object.values(grouped)) {
    bucket.sort((a, b) => a.index - b.index);
  }
  return grouped;
}

interface MilestoneActions {
  submit: (
    agreementId: string,
    index: number,
    evidence: string,
  ) => Promise<ContractActionResult>;
  approve: (
    agreementId: string,
    index: number,
  ) => Promise<ContractActionResult>;
  dispute: (
    agreementId: string,
    index: number,
    reason: string,
  ) => Promise<ContractActionResult>;
  escalate: (
    agreementId: string,
    index: number,
    reason: string,
  ) => Promise<ContractActionResult>;
  resolve: (
    agreementId: string,
    index: number,
    inFreelancerFavor: boolean,
  ) => Promise<ContractActionResult>;
  refundOverdue: (
    agreementId: string,
    index: number,
  ) => Promise<ContractActionResult>;
}

interface MilestoneContextValue {
  /** Flat list of every milestone visible to the signed-in wallet. */
  milestones: Milestone[];
  /** Milestones grouped by the agreement they belong to. */
  byAgreement: Record<string, Milestone[]>;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  actions: MilestoneActions;
}

const MilestoneContext = createContext<MilestoneContextValue | null>(null);
MilestoneContext.displayName = "MilestoneContext";

export function MilestoneProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [records, setRecords] = useState<MilestoneRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const { publicKey, reconcile } = useWalletContext();

  const cacheKey = publicKey
    ? getWalletScopedKey(LS_MILESTONES_CACHE, publicKey)
    : LS_MILESTONES_CACHE;

  const getClient = useCallback(async () => {
    if (!publicKey) throw new Error("Wallet not connected");
    await reconcile();
    const resolved = await getAuthenticatedClient(publicKey);
    if (!resolved) throw new Error("Wallet sign-in is required.");
    return resolved;
  }, [publicKey, reconcile]);

  const [sessionGeneration, setSessionGeneration] = useState(0);
  const [consentGeneration, setConsentGeneration] = useState(0);
  useEffect(() => onSessionChange(() => setSessionGeneration((n) => n + 1)), []);
  useEffect(() => {
    const refresh = () => setConsentGeneration((n) => n + 1);
    window.addEventListener("belay:consent-changed", refresh);
    return () => window.removeEventListener("belay:consent-changed", refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!publicKey) {
      setClient(null);
      return;
    }

    getAuthenticatedClient(publicKey)
      .then((resolved) => {
        if (!cancelled) setClient(resolved);
      })
      .catch((err) => {
        if (cancelled) return;
        logWarn("milestone.signin_failed_using_cache", {
          fields: {
            ...supabaseErrorFields(err),
            error: err instanceof Error ? err.message : String(err),
          },
        });
        setClient(null);
      });

    return () => {
      cancelled = true;
    };
  }, [publicKey, sessionGeneration]);

  const load = useCallback(
    async (resolvedClient: SupabaseClient | null) => {
      setIsLoading(true);

      if (!publicKey) {
        setRecords([]);
        setIsLoading(false);
        return;
      }

      if (!resolvedClient) {
        if (!hasProvenOwnership(publicKey)) {
          setRecords([]);
          setIsLoading(false);
          return;
        }
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) setRecords(deserializeRecords(raw));
        } catch {
          // ignore malformed cache
        }
        setIsLoading(false);
        return;
      }

      try {
        // RLS scopes this to agreements the wallet is a party to, so no
        // explicit agreement filter is needed (or wanted) here.
        const { data, error: queryError } = await resolvedClient
          .from("milestones")
          .select("*")
          .order("idx", { ascending: true });

        if (queryError) throw queryError;

        const rows: MilestoneRecord[] = (data ?? []).map((row: MilestoneDbRow) => ({
          agreementId: String(row.agreement_id ?? ""),
          milestone: dbRowToMilestone(row),
        }));
        setRecords(rows);
        setError(null);
        try {
          localStorage.setItem(cacheKey, serializeRecords(rows));
        } catch {
          // private-mode browsers refuse writes
        }
      } catch (err) {
        logWarn("milestone.load_failed_using_cache", {
          fields: supabaseErrorFields(err),
        });
        setError(userFacingMessage(err).message);
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) setRecords(deserializeRecords(raw));
        } catch {
          // ignore
        }
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, cacheKey],
  );

  useEffect(() => {
    void load(client);
  }, [client, publicKey, consentGeneration, load]);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    try {
      const resolved = client ?? (await getAuthenticatedClient(publicKey));
      await load(resolved);
    } catch (err) {
      logWarn("milestone.refresh_failed", {
        fields: supabaseErrorFields(err),
      });
    }
  }, [publicKey, client, load]);

  const mergeRecord = useCallback(
    (incoming: MilestoneRecord) => {
      setRecords((prev) => {
        const key = recordKey(incoming);
        const exists = prev.some((record) => recordKey(record) === key);
        const next = exists
          ? prev.map((record) =>
              recordKey(record) === key ? incoming : record,
            )
          : [...prev, incoming];
        try {
          localStorage.setItem(cacheKey, serializeRecords(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [cacheKey],
  );

  // Realtime authorizes on the socket's own JWT; RLS limits the feed to
  // milestones belonging to agreements this wallet is a party to.
  useEffect(() => {
    if (!client || !publicKey) return;

    const channel = client
      .channel("milestones-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "milestones" },
        (payload: RealtimePostgresChangesPayload<MilestoneDbRow>) => {
          const row = payload.new as MilestoneDbRow;
          if (!row) return;
          mergeRecord({
            agreementId: String(row.agreement_id ?? ""),
            milestone: dbRowToMilestone(row),
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "milestones" },
        (payload: RealtimePostgresChangesPayload<MilestoneDbRow>) => {
          const row = payload.new as MilestoneDbRow;
          if (!row) return;
          mergeRecord({
            agreementId: String(row.agreement_id ?? ""),
            milestone: dbRowToMilestone(row),
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "milestones" },
        (payload: RealtimePostgresChangesPayload<MilestoneDbRow>) => {
          // A DELETE payload carries only the primary key(s) in `old`; the
          // typed row keeps the access honest without widening to `any`.
          const row = payload.old as Partial<MilestoneDbRow>;
          if (!row) return;
          const agreementId = String(row.agreement_id ?? "");
          const index = Number(row.idx ?? row.index ?? 0);
          setRecords((prev) => {
            const next = prev.filter(
              (record) =>
                !(
                  record.agreementId === agreementId &&
                  record.milestone.index === index
                ),
            );
            try {
              localStorage.setItem(cacheKey, serializeRecords(next));
            } catch {
              // ignore
            }
            return next;
          });
        },
      )
      .subscribe((status, err) => {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          reportError("milestone.realtime_failed", err, {
            fields: { status },
          });
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, publicKey, cacheKey, mergeRecord]);

  /**
   * Applies a post-action milestone state locally (so the UI reacts without
   * waiting on an indexer) and best-effort mirrors it into Supabase.
   */
  const applyStatus = useCallback(
    async (
      agreementId: string,
      index: number,
      status: MilestoneStatus,
      extra: { evidence?: string; hash?: string } = {},
    ) => {
      const now = Date.now();
      setRecords((prev) => {
        const next = prev.map((record) => {
          if (
            record.agreementId !== agreementId ||
            record.milestone.index !== index
          ) {
            return record;
          }
          return {
            ...record,
            milestone: {
              ...record.milestone,
              status,
              evidence: extra.evidence ?? record.milestone.evidence,
              submittedAt:
                status === "submitted" ? now : record.milestone.submittedAt,
              resolvedAt:
                status === "released" || status === "refunded"
                  ? now
                  : record.milestone.resolvedAt,
            },
          };
        });
        try {
          localStorage.setItem(cacheKey, serializeRecords(next));
        } catch {
          // ignore
        }
        return next;
      });

      try {
        const dbClient = await getClient();
        const update: Record<string, unknown> = {
          status,
          updated_at: new Date(now).toISOString(),
        };
        if (extra.evidence !== undefined) update.evidence = extra.evidence;
        if (extra.hash) update.tx_hash = extra.hash;
        if (status === "submitted") update.submitted_at = new Date(now).toISOString();
        if (status === "released" || status === "refunded") {
          update.resolved_at = new Date(now).toISOString();
        }
        const { error: updateError } = await dbClient
          .from("milestones")
          .update(update)
          .eq("agreement_id", agreementId)
          .eq("idx", index);
        if (updateError) {
          logWarn("milestone.persist_failed", {
            fields: {
              agreementId,
              index,
              ...supabaseErrorFields(updateError),
            },
          });
        }
      } catch (err) {
        logWarn("milestone.persist_failed", {
          fields: { agreementId, index, ...supabaseErrorFields(err) },
        });
      }
    },
    [cacheKey, getClient],
  );

  const submit = useCallback(
    async (agreementId: string, index: number, evidence: string) => {
      if (!publicKey) return { success: false, error: "Wallet not connected" };
      const result = await submitMilestoneOnChain({
        walletPublicKey: publicKey,
        agreementId,
        index,
        evidence,
      });
      if (result.success) {
        await applyStatus(agreementId, index, "submitted", {
          evidence,
          hash: result.hash,
        });
        await refresh();
      } else {
        reportError("milestone.submit_failed", result.error, {
          fields: { agreementId, index },
        });
      }
      return result;
    },
    [publicKey, applyStatus, refresh],
  );

  const approve = useCallback(
    async (agreementId: string, index: number) => {
      if (!publicKey) return { success: false, error: "Wallet not connected" };
      const result = await approveMilestoneOnChain({
        walletPublicKey: publicKey,
        agreementId,
        index,
      });
      if (result.success) {
        await applyStatus(agreementId, index, "released", {
          hash: result.hash,
        });
        await refresh();
      } else {
        reportError("milestone.approve_failed", result.error, {
          fields: { agreementId, index },
        });
      }
      return result;
    },
    [publicKey, applyStatus, refresh],
  );

  const dispute = useCallback(
    async (agreementId: string, index: number, reason: string) => {
      if (!publicKey) return { success: false, error: "Wallet not connected" };
      const result = await disputeMilestoneOnChain({
        walletPublicKey: publicKey,
        agreementId,
        index,
        reason,
      });
      if (result.success) {
        await applyStatus(agreementId, index, "disputed", {
          evidence: reason,
          hash: result.hash,
        });
        await refresh();
      } else {
        reportError("milestone.dispute_failed", result.error, {
          fields: { agreementId, index },
        });
      }
      return result;
    },
    [publicKey, applyStatus, refresh],
  );

  const escalate = useCallback(
    async (agreementId: string, index: number, reason: string) => {
      if (!publicKey) return { success: false, error: "Wallet not connected" };
      const result = await escalateMilestoneOnChain({
        walletPublicKey: publicKey,
        agreementId,
        index,
        reason,
      });
      if (result.success) {
        await applyStatus(agreementId, index, "disputed", {
          evidence: reason,
          hash: result.hash,
        });
        await refresh();
      } else {
        reportError("milestone.escalate_failed", result.error, {
          fields: { agreementId, index },
        });
      }
      return result;
    },
    [publicKey, applyStatus, refresh],
  );

  const resolve = useCallback(
    async (
      agreementId: string,
      index: number,
      inFreelancerFavor: boolean,
    ) => {
      if (!publicKey) return { success: false, error: "Wallet not connected" };
      const result = await resolveDisputeOnChain({
        walletPublicKey: publicKey,
        agreementId,
        index,
        inFreelancerFavor,
      });
      if (result.success) {
        await applyStatus(
          agreementId,
          index,
          inFreelancerFavor ? "released" : "refunded",
          { hash: result.hash },
        );
        await refresh();
      } else {
        reportError("milestone.resolve_failed", result.error, {
          fields: { agreementId, index },
        });
      }
      return result;
    },
    [publicKey, applyStatus, refresh],
  );

  const refundOverdue = useCallback(
    async (agreementId: string, index: number) => {
      if (!publicKey) return { success: false, error: "Wallet not connected" };
      const result = await refundOverdueMilestoneOnChain({
        walletPublicKey: publicKey,
        agreementId,
        index,
      });
      if (result.success) {
        await applyStatus(agreementId, index, "refunded", {
          hash: result.hash,
        });
        await refresh();
      } else {
        reportError("milestone.refund_overdue_failed", result.error, {
          fields: { agreementId, index },
        });
      }
      return result;
    },
    [publicKey, applyStatus, refresh],
  );

  const actions = useMemo<MilestoneActions>(
    () => ({ submit, approve, dispute, escalate, resolve, refundOverdue }),
    [submit, approve, dispute, escalate, resolve, refundOverdue],
  );

  const byAgreement = useMemo(() => groupRecords(records), [records]);
  const milestones = useMemo(
    () => records.map((record) => record.milestone),
    [records],
  );

  const value = useMemo<MilestoneContextValue>(
    () => ({
      milestones,
      byAgreement,
      isLoading,
      error,
      refresh,
      actions,
    }),
    [milestones, byAgreement, isLoading, error, refresh, actions],
  );

  return (
    <MilestoneContext.Provider value={value}>
      {children}
    </MilestoneContext.Provider>
  );
}

export interface UseMilestonesResult {
  milestones: Milestone[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  submit: (index: number, evidence: string) => Promise<ContractActionResult>;
  approve: (index: number) => Promise<ContractActionResult>;
  dispute: (index: number, reason: string) => Promise<ContractActionResult>;
  escalate: (index: number, reason: string) => Promise<ContractActionResult>;
  resolve: (
    index: number,
    inFreelancerFavor: boolean,
  ) => Promise<ContractActionResult>;
  refundOverdue: (index: number) => Promise<ContractActionResult>;
}

const NO_SCOPE: ContractActionResult = {
  success: false,
  error: "No agreement selected.",
};

/**
 * Milestone state scoped to one agreement. With an `agreementId` the returned
 * list and actions are bound to that agreement; without one the list is every
 * milestone the wallet can see and the actions refuse to guess a target.
 */
export function useMilestones(agreementId?: string): UseMilestonesResult {
  const ctx = useContext(MilestoneContext);
  if (!ctx) {
    throw new Error("useMilestones must be used within <MilestoneProvider />");
  }

  const { actions } = ctx;

  const submit = useCallback(
    (index: number, evidence: string) =>
      agreementId
        ? actions.submit(agreementId, index, evidence)
        : Promise.resolve(NO_SCOPE),
    [actions, agreementId],
  );
  const approve = useCallback(
    (index: number) =>
      agreementId
        ? actions.approve(agreementId, index)
        : Promise.resolve(NO_SCOPE),
    [actions, agreementId],
  );
  const dispute = useCallback(
    (index: number, reason: string) =>
      agreementId
        ? actions.dispute(agreementId, index, reason)
        : Promise.resolve(NO_SCOPE),
    [actions, agreementId],
  );
  const escalate = useCallback(
    (index: number, reason: string) =>
      agreementId
        ? actions.escalate(agreementId, index, reason)
        : Promise.resolve(NO_SCOPE),
    [actions, agreementId],
  );
  const resolve = useCallback(
    (index: number, inFreelancerFavor: boolean) =>
      agreementId
        ? actions.resolve(agreementId, index, inFreelancerFavor)
        : Promise.resolve(NO_SCOPE),
    [actions, agreementId],
  );
  const refundOverdue = useCallback(
    (index: number) =>
      agreementId
        ? actions.refundOverdue(agreementId, index)
        : Promise.resolve(NO_SCOPE),
    [actions, agreementId],
  );

  return {
    milestones: agreementId
      ? ctx.byAgreement[agreementId] ?? []
      : ctx.milestones,
    isLoading: ctx.isLoading,
    error: ctx.error,
    refresh: ctx.refresh,
    submit,
    approve,
    dispute,
    escalate,
    resolve,
    refundOverdue,
  };
}
