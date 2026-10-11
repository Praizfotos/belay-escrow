import * as fs from "node:fs";
import * as path from "node:path";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { parseEscrowEvent } from "@/lib/stellar/events";

/** Shape of the fields the parser reads off an `rpc.Api.EventResponse`. */
function rawEvent(
  topic: xdr.ScVal[],
  value: xdr.ScVal,
  overrides: Record<string, unknown> = {},
) {
  return {
    ledger: 101,
    ledgerClosedAt: "2024-01-01T00:00:00Z",
    txHash: "abc123",
    topic,
    value,
    ...overrides,
  } as unknown as Parameters<typeof parseEscrowEvent>[0];
}

function agreementTopic(name: string, id?: string): xdr.ScVal[] {
  const topic = [xdr.ScVal.scvSymbol(name)];
  if (id !== undefined) topic.push(nativeToScVal(id, { type: "string" }));
  return topic;
}

describe("parseEscrowEvent", () => {
  it("parses a funded event and reads the amount from the payload", () => {
    const parsed = parseEscrowEvent(
      rawEvent(
        agreementTopic("agr_fund", "agr-1"),
        nativeToScVal({ amount: "2500000" }),
      ),
    );

    expect(parsed).toEqual({
      ledger: 101,
      ledgerClosedAt: "2024-01-01T00:00:00Z",
      agreementId: "agr-1",
      kind: "funded",
      index: undefined,
      amountStroops: "2500000",
      actor: undefined,
      txHash: "abc123",
    });
  });

  it("maps mil_add to the created kind and carries the milestone index", () => {
    const parsed = parseEscrowEvent(
      rawEvent(
        agreementTopic("mil_add", "agr-2"),
        nativeToScVal({ index: 2, amount: "700" }),
      ),
    );

    expect(parsed?.kind).toBe("created");
    expect(parsed?.agreementId).toBe("agr-2");
    expect(parsed?.index).toBe(2);
    expect(parsed?.amountStroops).toBe("700");
  });

  it.each([
    ["mil_sub", "submitted"],
    ["mil_appr", "approved"],
    ["mil_dsp", "disputed"],
    ["mil_res", "resolved"],
    ["mil_ref", "refunded"],
  ] as const)("maps the %s topic to the %s kind", (topic, kind) => {
    const parsed = parseEscrowEvent(
      rawEvent(agreementTopic(topic, "agr-3"), nativeToScVal({})),
    );
    expect(parsed?.kind).toBe(kind);
  });

  it("reads the actor from the payload for the relevant kinds", () => {
    expect(
      parseEscrowEvent(
        rawEvent(
          agreementTopic("agr_cre", "agr-4"),
          nativeToScVal({ client: "GCLIENT" }),
        ),
      )?.actor,
    ).toBe("GCLIENT");

    expect(
      parseEscrowEvent(
        rawEvent(
          agreementTopic("mil_appr", "agr-4"),
          nativeToScVal({ freelancer: "GFREELANCER" }),
        ),
      )?.actor,
    ).toBe("GFREELANCER");

    expect(
      parseEscrowEvent(
        rawEvent(
          agreementTopic("mil_dsp", "agr-4"),
          nativeToScVal({ by: "GCLIENT" }),
        ),
      )?.actor,
    ).toBe("GCLIENT");

    expect(
      parseEscrowEvent(
        rawEvent(
          agreementTopic("mil_res", "agr-4"),
          nativeToScVal({ resolver: "GARBITRATOR" }),
        ),
      )?.actor,
    ).toBe("GARBITRATOR");
  });

  it("reads the refunded total for a cancellation", () => {
    const parsed = parseEscrowEvent(
      rawEvent(
        agreementTopic("agr_cnc", "agr-5"),
        nativeToScVal({ refunded: "5000000" }),
      ),
    );

    expect(parsed?.kind).toBe("cancelled");
    expect(parsed?.amountStroops).toBe("5000000");
  });

  it("reads the released total for a completion", () => {
    const parsed = parseEscrowEvent(
      rawEvent(
        agreementTopic("agr_cmp", "agr-6"),
        nativeToScVal({ released: "9000000" }),
      ),
    );

    expect(parsed?.kind).toBe("completed");
    expect(parsed?.amountStroops).toBe("9000000");
  });

  it("ignores a topic that is not a Belay escrow event", () => {
    expect(
      parseEscrowEvent(
        rawEvent(agreementTopic("transfer", "agr-7"), nativeToScVal({})),
      ),
    ).toBeNull();
  });

  it("returns null when no agreement id is present anywhere", () => {
    expect(
      parseEscrowEvent(
        rawEvent(agreementTopic("agr_fund"), nativeToScVal({})),
      ),
    ).toBeNull();
  });

  it("falls back to the payload's agreement_id when the topic omits it", () => {
    const parsed = parseEscrowEvent(
      rawEvent(
        agreementTopic("agr_fund"),
        nativeToScVal({ agreement_id: "agr-8", amount: "1" }),
      ),
    );

    expect(parsed?.agreementId).toBe("agr-8");
  });

  it("never throws on a malformed payload", () => {
    const malformed = {
      ledger: 1,
      ledgerClosedAt: "",
      txHash: "",
      topic: [xdr.ScVal.scvSymbol("agr_fund")],
      value: "not-a-scval" as unknown as xdr.ScVal,
    } as unknown as Parameters<typeof parseEscrowEvent>[0];

    expect(() => parseEscrowEvent(malformed)).not.toThrow();
    expect(parseEscrowEvent(malformed)).toBeNull();
  });
});

/**
 * Every event topic the CURRENT contract sources publish
 * (`contract/src/lib.rs` for BelayError-side events, `contract/src/vault.rs`
 * for the vault). The parser intentionally only understands the
 * agreement-scoped subset; the rest must be consciously classified here so a
 * newly added topic cannot ship without a decision about whether the frontend
 * should surface it.
 */
const PARSED_TOPICS = [
  "agr_cre",
  "mil_add",
  "agr_fund",
  "mil_sub",
  "mil_appr",
  "mil_dsp",
  "mil_res",
  "mil_ref",
  "agr_cnc",
  "agr_cmp",
] as const;

const IGNORED_TOPICS = [
  "px_init",
  "upgrade",
  "migrate",
  "vault_cfg",
  "arb_set",
  "arb_clr",
  "vault_ini",
  "vlt_fund",
  "vlt_rel",
  "vlt_ref",
] as const;

/** Every `symbol_short!` in the contract sources is an event topic. */
function rustEventTopics(): string[] {
  const topics = new Set<string>();
  for (const rel of ["contract/src/lib.rs", "contract/src/vault.rs"]) {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    for (const match of src.matchAll(/symbol_short!\("([a-z0-9_]+)"\)/g)) {
      topics.add(match[1]);
    }
  }
  return [...topics].sort();
}

describe("event topic coverage against the current contract sources", () => {
  it("classifies every topic the contracts publish", () => {
    expect(rustEventTopics()).toEqual(
      [...new Set([...PARSED_TOPICS, ...IGNORED_TOPICS])].sort(),
    );
  });

  it.each(PARSED_TOPICS)("parses the agreement topic %s into an event", (topic) => {
    const parsed = parseEscrowEvent(
      rawEvent(agreementTopic(topic, "agr-cov"), nativeToScVal({})),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.agreementId).toBe("agr-cov");
  });

  it.each(IGNORED_TOPICS)(
    "returns null for the non-agreement topic %s (config/upgrade/vault move)",
    (topic) => {
      // Carries an agreement id on the topic so a null result is attributed to
      // the unknown-kind check, not a missing identifier.
      expect(
        parseEscrowEvent(
          rawEvent(agreementTopic(topic, "agr-cov"), nativeToScVal({})),
        ),
      ).toBeNull();
    },
  );
});
