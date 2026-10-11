/** @jest-environment jsdom */

/**
 * Regression tests for "the offline cache is global, not per wallet, and is
 * never cleared on disconnect".
 *
 * The leak was: wallet A's agreements were cached under a single global key,
 * survived disconnect, and were then rendered to wallet B during the window
 * before B signed — or forever, if B never signed.
 */
import React from "react";
import { AgreementProvider, useAgreements } from "@/context/AgreementContext";
import {
  LS_AGREEMENTS,
  LS_USER,
  clearAppCaches,
  getWalletScopedKey,
} from "@/lib/utils/constants";

const { render, screen, waitFor } = require("@testing-library/react");

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/supabase/session", () => ({
  getAuthenticatedClient: jest.fn(),
  requireAuthenticatedClient: jest.fn(),
  clearWalletSession: jest.fn(),
  readStoredSession: jest.fn(() => null),
  onSessionChange: jest.fn(() => () => {}),
}));

// The contract client is only exercised by the write actions, which these
// cache-isolation tests never call.
jest.mock("@/lib/stellar/contract", () => ({
  createAgreementOnChain: jest.fn(),
  addMilestoneOnChain: jest.fn(),
  fundAgreementOnChain: jest.fn(),
  cancelAgreementOnChain: jest.fn(),
}));

let mockPublicKey: string | null = null;
jest.mock("@/context/WalletContext", () => ({
  useWalletContext: () => ({ publicKey: mockPublicKey, reconcile: async () => {} }),
}));

const { getAuthenticatedClient, readStoredSession } = require("@/lib/supabase/session");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WALLET_A = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAY";
const WALLET_B = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

const SECRET_AGREEMENT = {
  id: "agr-1",
  client: WALLET_A,
  freelancer: WALLET_B,
  title: "Wallet A private build",
  status: "draft",
  totalStroops: 10_000_000n,
  escrowedStroops: 0n,
  releasedStroops: 0n,
  refundedStroops: 0n,
  milestoneCount: 1,
  createdAt: 1_700_000_000_000,
  fundedAt: 0,
  closedAt: 0,
};

function serialize(list: unknown[]): string {
  return JSON.stringify(list, (_k, v) => (typeof v === "bigint" ? { $bigint: v.toString() } : v));
}

function AgreementProbe() {
  const { agreements } = useAgreements();
  return <div data-testid="agreements">{agreements.map((e) => e.title).join("|")}</div>;
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockPublicKey = null;
  // No wallet has signed a challenge unless a test says so.
  readStoredSession.mockReturnValue(null);
  // Never resolve a client — this is the pre-signature window under test.
  getAuthenticatedClient.mockImplementation(() => new Promise(() => {}));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("offline agreement cache isolation", () => {
  it("does not show wallet A's cached agreements to wallet B", async () => {
    localStorage.setItem(
      getWalletScopedKey(LS_AGREEMENTS, WALLET_A),
      serialize([SECRET_AGREEMENT]),
    );

    mockPublicKey = WALLET_B;
    render(
      <AgreementProvider>
        <AgreementProbe />
      </AgreementProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("agreements").textContent).toBe("");
    });
    expect(screen.getByTestId("agreements").textContent).not.toContain("Wallet A");
  });

  it("withholds a wallet's own cache until it has proven ownership", async () => {
    localStorage.setItem(
      getWalletScopedKey(LS_AGREEMENTS, WALLET_A),
      serialize([SECRET_AGREEMENT]),
    );

    mockPublicKey = WALLET_A;
    render(
      <AgreementProvider>
        <AgreementProbe />
      </AgreementProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("agreements").textContent).toBe("");
    });
  });

  it("serves a wallet its own cache once it holds a verified session", async () => {
    localStorage.setItem(
      getWalletScopedKey(LS_AGREEMENTS, WALLET_A),
      serialize([SECRET_AGREEMENT]),
    );
    readStoredSession.mockImplementation((wallet: string) =>
      wallet === WALLET_A
        ? { walletAddress: WALLET_A, accessToken: "t", expiresAt: Date.now() + 60_000 }
        : null,
    );

    mockPublicKey = WALLET_A;
    render(
      <AgreementProvider>
        <AgreementProbe />
      </AgreementProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("agreements").textContent).toBe("Wallet A private build");
    });
  });

  it("ignores a legacy unscoped cache entirely", async () => {
    localStorage.setItem(LS_AGREEMENTS, serialize([SECRET_AGREEMENT]));
    readStoredSession.mockReturnValue({
      walletAddress: WALLET_B,
      accessToken: "t",
      expiresAt: Date.now() + 60_000,
    });

    mockPublicKey = WALLET_B;
    render(
      <AgreementProvider>
        <AgreementProbe />
      </AgreementProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("agreements").textContent).toBe("");
    });
  });
});

describe("clearAppCaches", () => {
  it("purges every wallet-scoped and legacy cache key", () => {
    localStorage.setItem(LS_AGREEMENTS, "[]");
    localStorage.setItem(LS_USER, "{}");
    localStorage.setItem(getWalletScopedKey(LS_AGREEMENTS, WALLET_A), "[]");
    localStorage.setItem(getWalletScopedKey(LS_USER, WALLET_A), "{}");
    localStorage.setItem(getWalletScopedKey(LS_AGREEMENTS, WALLET_B), "[]");

    clearAppCaches(WALLET_A);

    expect(localStorage.getItem(LS_AGREEMENTS)).toBeNull();
    expect(localStorage.getItem(LS_USER)).toBeNull();
    expect(localStorage.getItem(getWalletScopedKey(LS_AGREEMENTS, WALLET_A))).toBeNull();
    expect(localStorage.getItem(getWalletScopedKey(LS_USER, WALLET_A))).toBeNull();
    // Another wallet's cache is a leak vector too — disconnect clears it all.
    expect(localStorage.getItem(getWalletScopedKey(LS_AGREEMENTS, WALLET_B))).toBeNull();
  });
});
