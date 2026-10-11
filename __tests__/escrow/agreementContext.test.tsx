/** @jest-environment jsdom */

/**
 * Integration-style tests for `AgreementContext`, the boundary that turns the
 * user's intent into an on-chain agreement plus a Supabase mirror. The contract
 * client and Supabase session are mocked so the tests assert the ordering and
 * the arguments, not a live network.
 */
import React from "react";
import { AgreementProvider, useAgreements } from "@/context/AgreementContext";

const { render, screen, waitFor, act } = require("@testing-library/react");

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/supabase/session", () => ({
  getAuthenticatedClient: jest.fn(),
  requireAuthenticatedClient: jest.fn(),
  readStoredSession: jest.fn(() => null),
  onSessionChange: jest.fn(() => () => {}),
  clearWalletSession: jest.fn(),
}));

jest.mock("@/lib/stellar/contract", () => ({
  createAgreementOnChain: jest.fn(),
  addMilestoneOnChain: jest.fn(),
  fundAgreementOnChain: jest.fn(),
  cancelAgreementOnChain: jest.fn(),
}));

const reconcile = jest.fn(async () => {});
let mockPublicKey: string | null = null;
jest.mock("@/context/WalletContext", () => ({
  useWalletContext: () => ({ publicKey: mockPublicKey, reconcile }),
}));

const session = require("@/lib/supabase/session");
const contract = require("@/lib/stellar/contract");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAY";
const FREELANCER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

function fundedRow() {
  return {
    id: "agr-1",
    client_wallet: CLIENT,
    freelancer_wallet: FREELANCER,
    title: "Website build",
    status: "funded",
    total_stroops: "10000000",
    escrowed_stroops: "10000000",
    released_stroops: "0",
    refunded_stroops: "0",
    milestone_count: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    funded_at: "2026-01-01T00:05:00.000Z",
    closed_at: null,
  };
}

function makeClient(initialRows: unknown[]) {
  const state = { rows: initialRows };
  const updates: Record<string, unknown>[] = [];
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.or = () => builder;
  builder.order = () => ({ data: state.rows, error: null });
  builder.insert = () => ({ data: null, error: null });
  builder.upsert = () => ({ data: null, error: null });
  builder.update = (payload: Record<string, unknown>) => {
    updates.push(payload);
    return { eq: () => ({ error: null }) };
  };

  const channel: Record<string, unknown> = {};
  channel.on = () => channel;
  channel.subscribe = (cb?: (status: string) => void) => {
    cb?.("SUBSCRIBED");
    return channel;
  };

  return {
    client: {
      from: () => builder,
      channel: () => channel,
      removeChannel: () => {},
    },
    state,
    updates,
  };
}

let api: ReturnType<typeof useAgreements>;

function Capture() {
  api = useAgreements();
  return <div data-testid="titles">{api.agreements.map((e) => e.title).join("|")}</div>;
}

function renderProvider() {
  return render(
    <AgreementProvider>
      <Capture />
    </AgreementProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockPublicKey = CLIENT;
  reconcile.mockResolvedValue(undefined);
  session.readStoredSession.mockReturnValue(null);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AgreementContext loading", () => {
  it("loads the connected wallet's agreements from Supabase", async () => {
    const { client } = makeClient([fundedRow()]);
    session.getAuthenticatedClient.mockResolvedValue(client);
    session.requireAuthenticatedClient.mockResolvedValue(client);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("titles").textContent).toBe("Website build");
    });
    expect(api.agreements[0].totalStroops).toBe(10_000_000n);
    expect(api.agreements[0].status).toBe("funded");
  });

  it("shows an empty list when no wallet is connected", async () => {
    mockPublicKey = null;
    renderProvider();

    await waitFor(() => expect(screen.getByTestId("titles").textContent).toBe(""));
    expect(session.getAuthenticatedClient).not.toHaveBeenCalled();
  });
});

describe("AgreementContext.createAgreement", () => {
  const validInput = {
    id: "agr-9",
    title: "Logo design",
    client: CLIENT,
    freelancer: FREELANCER,
    milestones: [
      { index: 0, amount: "5", description: "Concepts" },
      { index: 1, amount: "5", description: "Final files" },
    ],
  };

  beforeEach(() => {
    const { client } = makeClient([]);
    session.getAuthenticatedClient.mockResolvedValue(client);
    session.requireAuthenticatedClient.mockResolvedValue(client);
  });

  it("rejects an invalid schedule before touching the chain", async () => {
    renderProvider();
    await waitFor(() => expect(api).toBeDefined());

    await act(async () => {
      await expect(
        api.createAgreement({
          ...validInput,
          milestones: [{ index: 0, amount: "0", description: "bad" }],
        }),
      ).rejects.toThrow();
    });

    expect(contract.createAgreementOnChain).not.toHaveBeenCalled();
    expect(contract.addMilestoneOnChain).not.toHaveBeenCalled();
  });

  it("creates the agreement, adds each milestone, and mirrors it locally", async () => {
    contract.createAgreementOnChain.mockResolvedValue({ success: true, hash: "tx-create" });
    contract.addMilestoneOnChain.mockResolvedValue({ success: true, hash: "tx-milestone" });

    renderProvider();
    await waitFor(() => expect(api).toBeDefined());

    await act(async () => {
      await api.createAgreement(validInput);
    });

    expect(contract.createAgreementOnChain).toHaveBeenCalledWith(
      expect.objectContaining({ agreementId: "agr-9", freelancer: FREELANCER, title: "Logo design" }),
    );
    expect(contract.addMilestoneOnChain).toHaveBeenCalledTimes(2);

    expect(screen.getByTestId("titles").textContent).toBe("Logo design");
    expect(api.agreements[0].totalStroops).toBe(100_000_000n);
  });

  it("surfaces a clear error and stores nothing when the chain rejects it", async () => {
    contract.createAgreementOnChain.mockResolvedValue({
      success: false,
      error: "Authorization failed for this operation.",
    });

    renderProvider();
    await waitFor(() => expect(api).toBeDefined());

    await act(async () => {
      await expect(api.createAgreement(validInput)).rejects.toThrow(
        /Authorization failed/,
      );
    });

    expect(contract.addMilestoneOnChain).not.toHaveBeenCalled();
    expect(screen.getByTestId("titles").textContent).toBe("");
  });
});

describe("AgreementContext.fundAgreement", () => {
  it("marks the agreement funded once the on-chain funding succeeds", async () => {
    const draft = { ...fundedRow(), status: "draft", escrowed_stroops: "0", funded_at: null };
    const { client, state, updates } = makeClient([draft]);
    session.getAuthenticatedClient.mockResolvedValue(client);
    session.requireAuthenticatedClient.mockResolvedValue(client);
    contract.fundAgreementOnChain.mockResolvedValue({ success: true, hash: "tx-fund", ledger: 7 });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("titles").textContent).toBe("Website build"));

    // The next Supabase read (refresh) returns the funded row, mirroring the
    // update the context just persisted.
    state.rows = [{ ...draft, status: "funded", escrowed_stroops: "50000000" }];

    await act(async () => {
      const result = await api.fundAgreement("agr-1", "5");
      expect(result.success).toBe(true);
    });

    expect(contract.fundAgreementOnChain).toHaveBeenCalledWith(
      expect.objectContaining({ agreementId: "agr-1", amountXlm: "5" }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "funded", escrowed_stroops: "50000000" }),
    );
    expect(api.agreements[0].status).toBe("funded");
    expect(api.agreements[0].escrowedStroops).toBe(50_000_000n);
  });

  it("leaves the agreement unchanged when funding fails", async () => {
    const { client } = makeClient([{ ...fundedRow(), status: "draft", escrowed_stroops: "0" }]);
    session.getAuthenticatedClient.mockResolvedValue(client);
    session.requireAuthenticatedClient.mockResolvedValue(client);
    contract.fundAgreementOnChain.mockResolvedValue({
      success: false,
      error: "Payment amount must be greater than zero.",
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("titles").textContent).toBe("Website build"));

    await act(async () => {
      const result = await api.fundAgreement("agr-1", "0");
      expect(result.success).toBe(false);
    });

    expect(api.agreements[0].status).toBe("draft");
    expect(api.agreements[0].escrowedStroops).toBe(0n);
  });
});
