import {
  MAX_DESCRIPTION_LENGTH,
  MAX_MILESTONES,
  TOKEN_DECIMALS,
  formatStroops,
  stroopsToToken,
  stroopsToXlm,
  tokenToStroops,
  validateSchedule,
  xlmToStroops,
} from "@/lib/escrow/planner";

describe("token amount conversion", () => {
  it("uses 7 decimals, matching a Stellar SEP-41 token", () => {
    expect(TOKEN_DECIMALS).toBe(7);
  });

  it("parses whole and fractional token amounts into stroops", () => {
    expect(xlmToStroops("1")).toBe(10_000_000n);
    expect(xlmToStroops("1.25")).toBe(12_500_000n);
    expect(xlmToStroops("0.0000001")).toBe(1n);
    expect(xlmToStroops("100")).toBe(1_000_000_000n);
    expect(xlmToStroops("0")).toBe(0n);
  });

  it("keeps the sign on a negative amount", () => {
    expect(xlmToStroops("-2.5")).toBe(-25_000_000n);
  });

  it("rejects more precision than the token has", () => {
    expect(() => xlmToStroops("1.00000001")).toThrow(/decimal places/i);
  });

  it.each(["", "  ", "abc", "1.2.3", "1,000", "1e7", "$5"])(
    "rejects a malformed amount %p",
    (bad) => {
      expect(() => xlmToStroops(bad)).toThrow(/Invalid token amount/i);
    },
  );

  it("round-trips stroops back to a full-precision token string", () => {
    expect(stroopsToXlm(10_000_000n)).toBe("1.0000000");
    expect(stroopsToXlm(12_500_000n)).toBe("1.2500000");
    expect(stroopsToXlm(0n)).toBe("0.0000000");
    expect(stroopsToXlm(-25_000_000n)).toBe("-2.5000000");
  });

  it("accepts stroops as a bigint, number or numeric string", () => {
    expect(stroopsToXlm("12500000")).toBe("1.2500000");
    expect(stroopsToXlm(12_500_000)).toBe("1.2500000");
  });

  it("refuses a non-integer number rather than silently truncating", () => {
    expect(() => stroopsToXlm(1.5)).toThrow(/integer/i);
    expect(() => stroopsToXlm(Number.NaN)).toThrow(/finite/i);
  });

  it("exposes tokenToStroops / stroopsToToken as aliases", () => {
    expect(tokenToStroops("3.5")).toBe(35_000_000n);
    expect(stroopsToToken(35_000_000n)).toBe("3.5000000");
  });
});

describe("formatStroops", () => {
  it("trims trailing zeros and groups thousands", () => {
    expect(formatStroops(12_500_000n)).toBe("1.25");
    expect(formatStroops(1_000_000_000n)).toBe("100");
    expect(formatStroops(1_234_500_000n)).toBe("123.45");
    expect(formatStroops(1_000_000n)).toBe("0.1");
    expect(formatStroops(0n)).toBe("0");
  });

  it("groups a large whole part with commas", () => {
    expect(formatStroops(1_234_567_890_000_000n)).toBe("123,456,789");
  });

  it("preserves a negative sign", () => {
    expect(formatStroops(-12_500_000n)).toBe("-1.25");
  });
});

describe("validateSchedule", () => {
  it("accepts a well-formed schedule and sums its stroops", () => {
    const result = validateSchedule([
      { amount: "1", description: "Design" },
      { amount: "2.5", description: "Build" },
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.totalStroops).toBe(35_000_000n);
  });

  it("requires at least one milestone", () => {
    const result = validateSchedule([]);
    expect(result.valid).toBe(false);
    expect(result.totalStroops).toBe(0n);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a schedule above the milestone limit", () => {
    const milestones = Array.from({ length: MAX_MILESTONES + 1 }, (_, i) => ({
      amount: "1",
      description: `M${i}`,
    }));

    const result = validateSchedule(milestones);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/No more than/i);
  });

  it("accepts exactly the milestone limit", () => {
    const milestones = Array.from({ length: MAX_MILESTONES }, (_, i) => ({
      amount: "1",
      description: `M${i}`,
    }));
    expect(validateSchedule(milestones).valid).toBe(true);
  });

  it("rejects a missing or over-long description", () => {
    expect(validateSchedule([{ amount: "1", description: "  " }]).valid).toBe(false);

    const tooLong = "x".repeat(MAX_DESCRIPTION_LENGTH + 1);
    const result = validateSchedule([{ amount: "1", description: tooLong }]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/characters or fewer/i);
  });

  it.each([
    ["zero", "0"],
    ["negative", "-1"],
    ["malformed", "abc"],
  ])("rejects a %s amount", (_label, amount) => {
    expect(validateSchedule([{ amount, description: "Work" }]).valid).toBe(false);
  });

  it("rejects a total above the on-chain escrow limit", () => {
    // 1e9 tokens = 1e16 stroops, one stroop above the cap.
    const result = validateSchedule([
      { amount: "1000000000.0000001", description: "Too much" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/above the allowed limit/i);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const result = validateSchedule([
      { amount: "0", description: "" },
      { amount: "nope", description: "ok" },
    ]);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
