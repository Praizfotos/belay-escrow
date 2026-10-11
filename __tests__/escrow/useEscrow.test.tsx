/** @jest-environment jsdom */

import React from "react";
import { useEscrow } from "@/hooks/useEscrow";
import type { UseEscrowResult } from "@/hooks/useEscrow";
import type { fundAgreementOnChain } from "@/lib/stellar/contract";

const { render, waitFor, act } = require("@testing-library/react");

jest.mock("@/lib/stellar/contract", () => ({
  fundAgreementOnChain: jest.fn(),
  getContractEscrowTokenBalance: jest.fn(),
}));

let mockPublicKey: string | null = null;
jest.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({ publicKey: mockPublicKey }),
}));

const contract = require("@/lib/stellar/contract");

const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAY";

let api: UseEscrowResult;

function Probe({ id }: { id?: string }) {
  api = useEscrow(id);
  return <div data-testid="status">{api.escrowState.status}</div>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPublicKey = WALLET;
  contract.getContractEscrowTokenBalance.mockResolvedValue({ success: true, balanceStroops: 0n });
});

describe("useEscrow balance", () => {
  it("reads and formats the wallet's escrow-token balance", async () => {
    contract.getContractEscrowTokenBalance.mockResolvedValue({
      success: true,
      balanceStroops: 35_000_000n,
    });

    render(<Probe id="agr-1" />);

    await waitFor(() => expect(api.tokenBalance).toBe("3.5000000"));
    expect(api.tokenBalanceStroops).toBe(35_000_000n);
  });

  it("leaves the balance unknown when the read fails", async () => {
    contract.getContractEscrowTokenBalance.mockResolvedValue({
      success: false,
      error: "Vault contract is not initialized yet.",
    });

    render(<Probe id="agr-1" />);

    await waitFor(() => expect(api.isLoadingBalance).toBe(false));
    expect(api.tokenBalance).toBeNull();
  });
});

describe("useEscrow.fund", () => {
  it("funds the agreement and reports success with the ledger", async () => {
    contract.fundAgreementOnChain.mockImplementation(
      async ({ onStatus }: Parameters<typeof fundAgreementOnChain>[0]) => {
        onStatus?.("simulating");
        onStatus?.("signing");
        onStatus?.("sending");
        onStatus?.("confirming");
        return { success: true, hash: "tx-fund", ledger: 42 };
      },
    );

    render(<Probe id="agr-1" />);
    await waitFor(() => expect(api).toBeDefined());

    await act(async () => {
      const result = await api.fund("5");
      expect(result.success).toBe(true);
    });

    expect(contract.fundAgreementOnChain).toHaveBeenCalledWith(
      expect.objectContaining({ agreementId: "agr-1", amountXlm: "5" }),
    );
    expect(api.isSuccess).toBe(true);
    expect(api.escrowState).toEqual({ status: "success", ledger: 42 });
  });

  it("refuses to fund without a selected agreement", async () => {
    render(<Probe />);
    await waitFor(() => expect(api).toBeDefined());

    await act(async () => {
      const result = await api.fund("5");
      expect(result.success).toBe(false);
    });

    expect(contract.fundAgreementOnChain).not.toHaveBeenCalled();
    expect(api.isError).toBe(true);
    expect(api.error).toBe("No agreement selected.");
  });

  it("refuses to fund without a connected wallet", async () => {
    mockPublicKey = null;
    render(<Probe id="agr-1" />);
    await waitFor(() => expect(api).toBeDefined());

    await act(async () => {
      const result = await api.fund("5");
      expect(result.success).toBe(false);
    });

    expect(contract.fundAgreementOnChain).not.toHaveBeenCalled();
    expect(api.error).toBe("Wallet not connected");
  });

  it("surfaces the contract's error when funding fails", async () => {
    contract.fundAgreementOnChain.mockResolvedValue({
      success: false,
      error: "The contract does not hold enough escrow for this operation.",
    });

    render(<Probe id="agr-1" />);
    await waitFor(() => expect(api).toBeDefined());

    await act(async () => {
      const result = await api.fund("5");
      expect(result.success).toBe(false);
    });

    expect(api.isError).toBe(true);
    expect(api.error).toBe("The contract does not hold enough escrow for this operation.");
  });
});
