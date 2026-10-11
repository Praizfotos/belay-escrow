import { parseAgreementRow, parseMilestoneRow } from "@/lib/supabase/rowGuards";

function agreementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "agr-1",
    client_wallet: "GCLIENT",
    freelancer_wallet: "GFREELANCER",
    title: "Website build",
    status: "funded",
    total_stroops: "10000000",
    escrowed_stroops: "10000000",
    released_stroops: "0",
    refunded_stroops: "0",
    milestone_count: 2,
    created_at: "2026-01-01T00:00:00.000Z",
    funded_at: "2026-01-01T00:05:00.000Z",
    closed_at: null,
    ...overrides,
  };
}

function milestoneRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "agr-1:0",
    agreement_id: "agr-1",
    idx: 0,
    amount_stroops: "5000000",
    description: "Design",
    due_at: "2026-02-01T00:00:00.000Z",
    status: "pending",
    evidence: null,
    submitted_at: null,
    resolved_at: null,
    ...overrides,
  };
}

describe("parseAgreementRow", () => {
  it("parses a valid agreement into the domain model", () => {
    const agreement = parseAgreementRow(agreementRow());

    expect(agreement).toMatchObject({
      id: "agr-1",
      client: "GCLIENT",
      freelancer: "GFREELANCER",
      title: "Website build",
      status: "funded",
      totalStroops: 10_000_000n,
      escrowedStroops: 10_000_000n,
      releasedStroops: 0n,
      refundedStroops: 0n,
      milestoneCount: 2,
      closedAt: 0,
    });
    expect(typeof agreement.createdAt).toBe("number");
    expect(agreement.createdAt).toBeGreaterThan(0);
  });

  it("defaults an unrecognised status to draft rather than trusting the row", () => {
    expect(parseAgreementRow(agreementRow({ status: "hacked" })).status).toBe("draft");
  });

  it("treats missing money columns as zero", () => {
    const agreement = parseAgreementRow(
      agreementRow({ total_stroops: null, escrowed_stroops: "", released_stroops: undefined }),
    );
    expect(agreement.totalStroops).toBe(0n);
    expect(agreement.escrowedStroops).toBe(0n);
    expect(agreement.releasedStroops).toBe(0n);
  });

  it("rejects a row missing its required identifiers", () => {
    expect(() => parseAgreementRow(agreementRow({ id: "" }))).toThrow(/id/);
    expect(() => parseAgreementRow(agreementRow({ title: "" }))).toThrow(/title/);
    expect(() => parseAgreementRow(agreementRow({ client_wallet: null }))).toThrow(
      /client_wallet/,
    );
    expect(() => parseAgreementRow(null)).toThrow(/malformed/i);
  });

  it("rejects a non-numeric money column instead of guessing", () => {
    expect(() => parseAgreementRow(agreementRow({ total_stroops: "abc" }))).toThrow(
      /total_stroops/,
    );
  });
});

describe("parseMilestoneRow", () => {
  it("parses a valid milestone row", () => {
    const milestone = parseMilestoneRow(milestoneRow());

    expect(milestone).toMatchObject({
      index: 0,
      amountStroops: 5_000_000n,
      description: "Design",
      status: "pending",
      evidence: "",
    });
    expect(milestone.dueAt).toBeGreaterThan(0);
  });

  it("accepts `index` when `idx` is absent", () => {
    const { idx: _idx, ...withoutIdx } = milestoneRow();
    expect(parseMilestoneRow({ ...withoutIdx, index: 3 }).index).toBe(3);
  });

  it("defaults an unrecognised status to pending", () => {
    expect(parseMilestoneRow(milestoneRow({ status: "weird" })).status).toBe("pending");
  });

  it("truncates a fractional numeric string to whole stroops", () => {
    expect(parseMilestoneRow(milestoneRow({ amount_stroops: "123.45" })).amountStroops).toBe(123n);
  });

  it("rejects a milestone with no description", () => {
    expect(() => parseMilestoneRow(milestoneRow({ description: "" }))).toThrow(/description/);
    expect(() => parseMilestoneRow("nope")).toThrow(/malformed/i);
  });
});
