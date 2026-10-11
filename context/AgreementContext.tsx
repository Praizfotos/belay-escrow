"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AgreementStatus,
  CreateAgreementInput,
  Agreement,
} from "@/types/agreement";
import type { ContractActionResult } from "@/lib/stellar/contract";
import {
  addMilestoneOnChain,
  cancelAgreementOnChain,
  createAgreementOnChain,
  fundAgreementOnChain,
} from "@/lib/stellar/contract";
import { tokenToStroops, validateSchedule } from "@/lib/escrow/planner";
import { getWalletScopedKey, LS_AGREEMENTS } from "@/lib/utils/constants";
import {
  getAuthenticatedClient,
  onSessionChange,
  readStoredSession,
  requireAuthenticatedClient,
} from "@/lib/supabase/session";
import type {
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import { useWalletContext } from "./WalletContext";
import { logWarn, reportError } from "@/lib/observability/logger";
import { supabaseErrorFields } from "@/lib/observability/supabaseError";
import { userFacingMessage } from "@/lib/errors/userMessage";

/**
 * True only when this browser holds an unexpired session token minted for this
 * exact wallet — i.e. the wallet has signed a server challenge at some point.
 *
 * The offline cache is readable by anyone at this keyboard, so possession of an
 * address alone must not unlock it: proof of ownership gates the read. The
 * token still authorizes nothing on its own, because the server re-verifies it
 * on every request.
 */
function hasProvenOwnership(walletAddress: string | null): boolean {
  if (!walletAddress) return false;
  try {
    return !!readStoredSession(walletAddress);
  } catch {
    return false;
  }
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

/** Postgres `numeric` arrives as a string; the domain model uses bigint stroops. */
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

/** Timestamps may be epoch numbers, numeric strings or ISO strings. */
function toEpoch(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    if (/^\d+$/.test(value.trim())) return Number(value.trim());
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function dbRowToAgreement(row: unknown): Agreement {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    client: String(r.client_wallet ?? r.client ?? ""),
    freelancer: String(r.freelancer_wallet ?? r.freelancer ?? ""),
    title: String(r.title ?? ""),
    status: asAgreementStatus(r.status),
    totalStroops: toStroopsValue(r.total_stroops),
    escrowedStroops: toStroopsValue(r.escrowed_stroops),
    releasedStroops: toStroopsValue(r.released_stroops),
    refundedStroops: toStroopsValue(r.refunded_stroops),
    milestoneCount: Number(r.milestone_count ?? 0) || 0,
    createdAt: toEpoch(r.created_at),
    fundedAt: toEpoch(r.funded_at),
    closedAt: toEpoch(r.closed_at),
  };
}

/**
 * The `agreements` row shape Supabase returns over REST and realtime.
 * Declared as a type alias (not an interface) so it satisfies the
 * `{ [key: string]: any }` constraint of `RealtimePostgresChangesPayload`
 * without falling back to `any` at the call sites.
 */
type AgreementDbRow = {
  id: string;
  client_wallet?: string | null;
  freelancer_wallet?: string | null;
  title?: string | null;
  status?: string | null;
  total_stroops?: string | number | null;
  escrowed_stroops?: string | number | null;
  released_stroops?: string | number | null;
  refunded_stroops?: string | number | null;
  milestone_count?: number | null;
  created_at?: string | number | null;
  funded_at?: string | number | null;
  closed_at?: string | number | null;
  updated_at?: string | number | null;
};

function agreementToDbInsertRow(agreement: Agreement, clientWallet: string) {
  const now = new Date().toISOString();
  return {
    id: agreement.id,
    client_wallet: agreement.client || clientWallet,
    freelancer_wallet: agreement.freelancer,
    title: agreement.title,
    status: agreement.status,
    total_stroops: agreement.totalStroops.toString(),
    escrowed_stroops: agreement.escrowedStroops.toString(),
    released_stroops: agreement.releasedStroops.toString(),
    refunded_stroops: agreement.refundedStroops.toString(),
    milestone_count: agreement.milestoneCount,
    created_at: new Date(agreement.createdAt || Date.now()).toISOString(),
    updated_at: now,
  };
}

/**
 * JSON has no bigint, and every money field on an `Agreement` is one, so the
 * cache round-trips through a tagged wrapper rather than corrupting to a string.
 */
function serializeAgreements(list: Agreement[]): string {
  return JSON.stringify(list, (_key, value) =>
    typeof value === "bigint" ? { $bigint: value.toString() } : value,
  );
}

function deserializeAgreements(raw: string): Agreement[] {
  return JSON.parse(raw, (_key, value) =>
    value &&
    typeof value === "object" &&
    typeof (value as { $bigint?: unknown }).$bigint === "string"
      ? BigInt((value as { $bigint: string }).$bigint)
      : value,
  ) as Agreement[];
}

function isRowForWallet(
  row: Partial<AgreementDbRow> | null | undefined,
  walletAddress: string | null,
): boolean {
  if (!walletAddress) return false;
  return (
    row?.client_wallet === walletAddress ||
    row?.freelancer_wallet === walletAddress
  );
}

interface AgreementContextType {
  agreements: Agreement[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createAgreement: (input: CreateAgreementInput) => Promise<Agreement>;
  fundAgreement: (id: string, amountXlm: string) => Promise<ContractActionResult>;
  cancelAgreement: (id: string) => Promise<ContractActionResult>;
}

const AgreementContext = createContext<AgreementContextType | null>(null);
AgreementContext.displayName = "AgreementContext";

export function AgreementProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const { publicKey, reconcile } = useWalletContext();

  // Every call is scoped by a JWT the server issues only after the wallet has
  // signed a challenge, so RLS has a wallet identity it can actually trust.
  const getClient = useCallback(async () => {
    if (!publicKey) throw new Error("Wallet not connected");
    await reconcile();
    return requireAuthenticatedClient(publicKey);
  }, [publicKey, reconcile]);

  // Rebind whenever the session is established or dropped, so a re-signed
  // session never leaves this provider holding a client with a stale token.
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const [consentGeneration, setConsentGeneration] = useState(0);
  useEffect(() => onSessionChange(() => setSessionGeneration((n) => n + 1)), []);
  useEffect(() => {
    const refresh = () => setConsentGeneration((n) => n + 1);
    window.addEventListener("belay:consent-changed", refresh);
    return () => window.removeEventListener("belay:consent-changed", refresh);
  }, []);

  const cacheKey = publicKey
    ? getWalletScopedKey(LS_AGREEMENTS, publicKey)
    : LS_AGREEMENTS;

  // Resolve the authenticated client once per wallet so the initial load and
  // the realtime feed share it.
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
        logWarn("agreement.signin_failed_using_cache", {
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
        setAgreements([]);
        setIsLoading(false);
        return;
      }

      // Without a proven wallet identity RLS returns nothing, so fall back to
      // whatever this browser cached rather than showing an empty list.
      if (!resolvedClient) {
        if (!hasProvenOwnership(publicKey)) {
          setAgreements([]);
          setIsLoading(false);
          return;
        }
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) setAgreements(deserializeAgreements(raw));
        } catch {
          // ignore malformed cache
        }
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: queryError } = await resolvedClient
          .from("agreements")
          .select("*")
          .or(
            `client_wallet.eq.${publicKey},freelancer_wallet.eq.${publicKey}`,
          )
          .order("created_at", { ascending: false });

        if (queryError) throw queryError;

        const rows = (data ?? []).map(dbRowToAgreement);
        setAgreements(rows);
        setError(null);
        try {
          localStorage.setItem(cacheKey, serializeAgreements(rows));
        } catch {
          // private-mode browsers refuse writes
        }
      } catch (err) {
        logWarn("agreement.load_failed_using_cache", {
          fields: supabaseErrorFields(err),
        });
        setError(userFacingMessage(err).message);
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) setAgreements(deserializeAgreements(raw));
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

  const patchAgreement = useCallback(
    (id: string, patch: Partial<Agreement>) => {
      setAgreements((prev) => {
        const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
        try {
          localStorage.setItem(cacheKey, serializeAgreements(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [cacheKey],
  );

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    try {
      const resolved = client ?? (await getAuthenticatedClient(publicKey));
      await load(resolved);
    } catch (err) {
      logWarn("agreement.refresh_failed", {
        fields: supabaseErrorFields(err),
      });
    }
  }, [publicKey, client, load]);

  // Realtime authorizes on the socket's own JWT, so the feed has to run on the
  // authenticated client too — the anon client would receive nothing.
  useEffect(() => {
    if (!client || !publicKey) return;

    const channel = client
      .channel("agreements-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agreements" },
        (payload: RealtimePostgresChangesPayload<AgreementDbRow>) => {
          const row = payload.new;
          if (!row) return;
          if (!isRowForWallet(row, publicKey)) return;
          const created = dbRowToAgreement(row);
          setAgreements((prev) => {
            if (prev.some((e) => e.id === created.id)) return prev;
            const next = [created, ...prev];
            try {
              localStorage.setItem(cacheKey, serializeAgreements(next));
            } catch {
              // ignore
            }
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agreements" },
        (payload: RealtimePostgresChangesPayload<AgreementDbRow>) => {
          const row = payload.new;
          if (!row || !isRowForWallet(row, publicKey)) return;
          const updated = dbRowToAgreement(row);
          setAgreements((prev) => {
            const next = prev.map((e) => (e.id === updated.id ? updated : e));
            try {
              localStorage.setItem(cacheKey, serializeAgreements(next));
            } catch {
              // ignore
            }
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "agreements" },
        (payload: RealtimePostgresChangesPayload<AgreementDbRow>) => {
          // A DELETE payload carries only the primary key(s) in `old`; the
          // typed row keeps the access honest without widening to `any`.
          const row = payload.old as Partial<AgreementDbRow>;
          if (!row || !isRowForWallet(row, publicKey)) return;
          const deletedId = row?.id;
          if (!deletedId) return;
          setAgreements((prev) => {
            const next = prev.filter((e) => e.id !== deletedId);
            try {
              localStorage.setItem(cacheKey, serializeAgreements(next));
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
          reportError("agreement.realtime_failed", err, {
            fields: { status },
          });
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, publicKey, cacheKey]);

  const createAgreement = useCallback(
    async (input: CreateAgreementInput): Promise<Agreement> => {
      if (!publicKey) throw new Error("Wallet not connected");

      const validation = validateSchedule(
        input.milestones.map((m) => ({
          amount: m.amount,
          description: m.description,
        })),
      );
      if (!validation.valid) {
        throw new Error(
          validation.errors.join(" ") || "The milestone schedule is invalid.",
        );
      }

      const agreementId = input.id;
      const clientAddress = input.client || publicKey;
      const freelancer = input.freelancer;

      const created = await createAgreementOnChain({
        walletPublicKey: publicKey,
        agreementId,
        client: clientAddress,
        freelancer,
        title: input.title,
      });
      if (!created.success) {
        throw new Error(
          created.error ?? "Could not create the agreement on-chain.",
        );
      }

      for (const milestone of input.milestones) {
        const added = await addMilestoneOnChain({
          walletPublicKey: publicKey,
          agreementId,
          index: milestone.index,
          amountXlm: milestone.amount,
          description: milestone.description,
          dueAt: milestone.dueAt ?? 0,
        });
        if (!added.success) {
          throw new Error(
            added.error ??
              `Could not add milestone ${milestone.index} on-chain.`,
          );
        }
      }

      const agreement: Agreement = {
        id: agreementId,
        client: clientAddress,
        freelancer,
        title: input.title,
        status: "draft",
        totalStroops: validation.totalStroops,
        escrowedStroops: 0n,
        releasedStroops: 0n,
        refundedStroops: 0n,
        milestoneCount: input.milestones.length,
        createdAt: Date.now(),
        fundedAt: 0,
        closedAt: 0,
      };

      const dbClient = await getClient();
      const { error: insertError } = await dbClient
        .from("agreements")
        .insert([agreementToDbInsertRow(agreement, publicKey)]);

      if (insertError) {
        reportError("agreement.persist_failed", insertError, {
          fields: { agreementId, ...supabaseErrorFields(insertError) },
        });
        throw insertError;
      }

      if (input.milestones.length > 0) {
        const milestoneRows = input.milestones.map((m) => ({
          id: `${agreementId}:${m.index}`,
          agreement_id: agreementId,
          idx: m.index,
          amount_stroops: tokenToStroops(m.amount).toString(),
          description: m.description,
          due_at: m.dueAt ? new Date(m.dueAt * 1000).toISOString() : null,
          status: "pending",
          evidence: "",
        }));
        const { error: milestonesError } = await dbClient
          .from("milestones")
          .insert(milestoneRows);
        if (milestonesError) {
          logWarn("agreement.persist_milestones_failed", {
            fields: {
              agreementId,
              ...supabaseErrorFields(milestonesError),
            },
          });
        }
      }

      setAgreements((prev) => {
        const next = prev.some((e) => e.id === agreement.id)
          ? prev.map((e) => (e.id === agreement.id ? agreement : e))
          : [agreement, ...prev];
        try {
          localStorage.setItem(cacheKey, serializeAgreements(next));
        } catch {
          // ignore
        }
        return next;
      });

      return agreement;
    },
    [publicKey, getClient, cacheKey],
  );

  const fundAgreement = useCallback(
    async (id: string, amountXlm: string): Promise<ContractActionResult> => {
      if (!publicKey) {
        return { success: false, error: "Wallet not connected" };
      }

      const result = await fundAgreementOnChain({
        walletPublicKey: publicKey,
        agreementId: id,
        amountXlm,
      });

      if (!result.success) {
        reportError("agreement.fund_failed", result.error, {
          fields: { agreementId: id },
        });
        return result;
      }

      const delta = tokenToStroops(amountXlm);
      const current = agreements.find((e) => e.id === id);
      const escrowedStroops = (current?.escrowedStroops ?? 0n) + delta;
      const fundedAt = Date.now();
      patchAgreement(id, { status: "funded", escrowedStroops, fundedAt });

      try {
        const dbClient = await getClient();
        const { error: updateError } = await dbClient
          .from("agreements")
          .update({
            status: "funded",
            escrowed_stroops: escrowedStroops.toString(),
            funding_tx: result.hash ?? null,
            funded_at: new Date(fundedAt).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (updateError) {
          logWarn("agreement.funding_persist_failed", {
            fields: { agreementId: id, ...supabaseErrorFields(updateError) },
          });
        }
      } catch (err) {
        logWarn("agreement.funding_persist_failed", {
          fields: { agreementId: id, ...supabaseErrorFields(err) },
        });
      }

      await refresh();
      return result;
    },
    [publicKey, agreements, patchAgreement, getClient, refresh],
  );

  const cancelAgreement = useCallback(
    async (id: string): Promise<ContractActionResult> => {
      if (!publicKey) {
        return { success: false, error: "Wallet not connected" };
      }

      const result = await cancelAgreementOnChain({
        walletPublicKey: publicKey,
        agreementId: id,
      });

      if (!result.success) {
        reportError("agreement.cancel_failed", result.error, {
          fields: { agreementId: id },
        });
        return result;
      }

      const closedAt = Date.now();
      patchAgreement(id, { status: "cancelled", closedAt });

      try {
        const dbClient = await getClient();
        const { error: updateError } = await dbClient
          .from("agreements")
          .update({
            status: "cancelled",
            closed_at: new Date(closedAt).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (updateError) {
          logWarn("agreement.cancel_persist_failed", {
            fields: { agreementId: id, ...supabaseErrorFields(updateError) },
          });
        }
      } catch (err) {
        logWarn("agreement.cancel_persist_failed", {
          fields: { agreementId: id, ...supabaseErrorFields(err) },
        });
      }

      await refresh();
      return result;
    },
    [publicKey, patchAgreement, getClient, refresh],
  );

  const value = useMemo<AgreementContextType>(
    () => ({
      agreements,
      isLoading,
      error,
      refresh,
      createAgreement,
      fundAgreement,
      cancelAgreement,
    }),
    [
      agreements,
      isLoading,
      error,
      refresh,
      createAgreement,
      fundAgreement,
      cancelAgreement,
    ],
  );

  return (
    <AgreementContext.Provider value={value}>
      {children}
    </AgreementContext.Provider>
  );
}

export function useAgreements(): AgreementContextType {
  const ctx = useContext(AgreementContext);
  if (!ctx) {
    throw new Error("useAgreements must be used within <AgreementProvider />");
  }
  return ctx;
}
