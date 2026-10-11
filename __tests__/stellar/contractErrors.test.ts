import * as fs from "node:fs";
import * as path from "node:path";
import { decodeContractError } from "@/lib/stellar/contract";
import { ContractErrorCode, VaultErrorCode } from "@/types/contract";

/** Extracts `Name = number` pairs from a `#[contracterror]` enum in Rust source. */
function rustErrorCodes(sourceFile: string, enumName: string): [string, number][] {
  const src = fs.readFileSync(path.join(process.cwd(), sourceFile), "utf8");
  const enumMatch = src.match(
    new RegExp(`pub enum ${enumName} \\{([\\s\\S]*?)\\n\\}`),
  );
  expect(enumMatch).not.toBeNull();
  const body = enumMatch![1];
  const pairs = [...body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)\s*,/gm)];
  expect(pairs.length).toBeGreaterThan(0);
  return pairs.map((m) => [m[1], Number(m[2])]);
}

describe("decodeContractError — Belay agreement errors (1..32)", () => {
  it.each<[ContractErrorCode, string]>([
    [ContractErrorCode.InvalidAmount, "Amount must be greater than zero."],
    [ContractErrorCode.AmountTooLarge, "Amount is above the allowed limit."],
    [ContractErrorCode.EmptyId, "Agreement ID or milestone description is missing."],
    [ContractErrorCode.IdTooLong, "Agreement ID is too long."],
    [ContractErrorCode.TitleTooLong, "The agreement title is too long."],
    [ContractErrorCode.DescriptionTooLong, "The milestone description is too long."],
    [ContractErrorCode.EvidenceTooLong, "The submitted evidence is too long."],
    [ContractErrorCode.ReasonTooLong, "The dispute reason is too long."],
    [ContractErrorCode.AlreadyInitialized, "Contract is already initialized."],
    [ContractErrorCode.NotInitialized, "Contract is not initialized yet."],
    [ContractErrorCode.InvalidActor, "Invalid actor for this operation."],
    [ContractErrorCode.AgreementExists, "An agreement with this ID already exists."],
    [ContractErrorCode.AgreementNotFound, "Agreement not found."],
    [ContractErrorCode.MilestoneNotFound, "Milestone not found."],
    [ContractErrorCode.InvalidMilestoneIndex, "Invalid milestone index."],
    [
      ContractErrorCode.TooManyMilestones,
      "This agreement already has the maximum number of milestones.",
    ],
    [ContractErrorCode.MilestoneExists, "A milestone already exists at this index."],
    [ContractErrorCode.InvalidStatus, "This action is not allowed in the current status."],
    [
      ContractErrorCode.NotFullyFunded,
      "The agreement must be fully funded before milestones can be submitted.",
    ],
    [ContractErrorCode.AlreadyFullyFunded, "The agreement is already fully funded."],
    [ContractErrorCode.NotDisputed, "This milestone is not under dispute."],
    [ContractErrorCode.NoArbitrator, "No arbitrator is configured to resolve this dispute."],
    [ContractErrorCode.Unauthorized, "Authorization failed for this operation."],
    [ContractErrorCode.CannotCancel, "This agreement can no longer be cancelled."],
    [ContractErrorCode.NotOverdue, "This milestone is not overdue yet."],
    [ContractErrorCode.VersionMismatch, "Contract storage version mismatch."],
    [ContractErrorCode.InvalidPage, "The requested page is invalid."],
    [ContractErrorCode.IndexOverflow, "Milestone index overflowed."],
    [ContractErrorCode.InsufficientEscrow, "The contract does not hold enough escrow for this operation."],
    [ContractErrorCode.SameParty, "Client and freelancer must be different accounts."],
    [ContractErrorCode.NoMilestones, "Add at least one milestone before funding."],
    [ContractErrorCode.AlreadyTerminal, "This agreement is already completed or cancelled."],
  ])("maps Belay code #%s to its message", (code, expected) => {
    expect(decodeContractError(`Error(Contract, #${code})`)).toBe(expected);
  });

  it("falls back to a numbered message for an unknown agreement code", () => {
    expect(decodeContractError("Error(Contract, #99)")).toBe("Contract error #99.");
  });
});

describe("decodeContractError — vault errors (101..111)", () => {
  it.each<[VaultErrorCode, string]>([
    [VaultErrorCode.AlreadyInitialized, "Vault is already initialized."],
    [VaultErrorCode.NotInitialized, "Vault contract is not initialized yet."],
    [VaultErrorCode.InvalidAmount, "Vault amount must be greater than zero."],
    [VaultErrorCode.InsufficientEscrow, "The vault does not hold enough escrow for this operation."],
    [VaultErrorCode.BalanceOverflow, "Vault balance overflowed."],
    [VaultErrorCode.VersionMismatch, "Vault storage version mismatch."],
    [VaultErrorCode.InvalidActor, "Invalid vault actor for this operation."],
    [VaultErrorCode.AmountTooLarge, "Vault amount is above the allowed limit."],
    [VaultErrorCode.TokenInUse, "The vault token cannot be changed while funds are locked."],
    [VaultErrorCode.IdTooLong, "Agreement ID is too long."],
    [VaultErrorCode.EmptyId, "Agreement ID is missing."],
  ])("maps vault code #%s to its message", (code, expected) => {
    expect(decodeContractError(`Error(Contract, #${code})`)).toBe(expected);
  });

  it("falls back to a vault-specific message for an unknown code at or above 100", () => {
    expect(decodeContractError("Error(Contract, #199)")).toBe("Vault error #199.");
  });
});

describe("decodeContractError — pass-through", () => {
  it("returns the raw message when it is not a contract error", () => {
    const raw = "network timeout";
    expect(decodeContractError(raw)).toBe(raw);
  });

  it("does not mistake a non-numeric contract error for a code", () => {
    const raw = "Error(Contract, #notanumber)";
    expect(decodeContractError(raw)).toBe(raw);
  });
});

// The TypeScript enums above are a hand-copy of the Rust `#[contracterror]`
// enums. If the contract renumbers or renames a variant and the copy is not
// updated, every decoded error message silently shifts. These tests read the
// actual contract sources so the copy cannot drift unnoticed.
describe("the TypeScript error enums match the deployed contract sources", () => {
  it("ContractErrorCode mirrors BelayError in contract/src/lib.rs", () => {
    const rustCodes = rustErrorCodes("contract/src/lib.rs", "BelayError");
    expect(rustCodes.map(([, code]) => code)).toEqual(
      Array.from({ length: rustCodes.length }, (_, i) => i + 1),
    );

    const ts = ContractErrorCode as unknown as Record<string, number>;
    const rustNames = rustCodes.map(([name]) => name);
    const tsNames = Object.keys(ts).filter((k) => Number.isInteger(ts[k]));

    for (const [name, code] of rustCodes) {
      expect(ts[name]).toBe(code);
    }
    // Both directions: a TS-only variant means a message exists for a code
    // the contract can never emit, which is just as much drift.
    expect(tsNames.sort()).toEqual(rustNames.sort());
  });

  it("VaultErrorCode mirrors VaultError in contract/src/vault.rs", () => {
    const rustCodes = rustErrorCodes("contract/src/vault.rs", "VaultError");
    expect(rustCodes.map(([, code]) => code)).toEqual(
      Array.from({ length: rustCodes.length }, (_, i) => 101 + i),
    );

    const ts = VaultErrorCode as unknown as Record<string, number>;
    const rustNames = rustCodes.map(([name]) => name);
    const tsNames = Object.keys(ts).filter((k) => Number.isInteger(ts[k]));

    for (const [name, code] of rustCodes) {
      expect(ts[name]).toBe(code);
    }
    expect(tsNames.sort()).toEqual(rustNames.sort());
  });
});
