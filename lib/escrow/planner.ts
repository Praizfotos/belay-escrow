export const TOKEN_DECIMALS = 7;

const TOKEN_FACTOR = 10n ** BigInt(TOKEN_DECIMALS);

/** Hard limits mirrored from the on-chain `add_milestone` validation. */
export const MAX_MILESTONES = 24;
export const MAX_DESCRIPTION_LENGTH = 240;
export const MAX_TOTAL_STROOPS = 10_000_000_000_000_000n;

function toBigInt(value: bigint | string | number): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Invalid stroops value: not finite.");
    }
    if (!Number.isInteger(value)) {
      throw new Error("Invalid stroops value: not an integer.");
    }
    return BigInt(value);
  }
  const str = value.trim();
  if (!/^-?\d+$/.test(str)) {
    throw new Error(`Invalid stroops value: ${value}`);
  }
  return BigInt(str);
}

export function xlmToStroops(amount: string): bigint {
  if (typeof amount !== "string") {
    throw new Error("Invalid token amount: expected a string.");
  }
  const str = amount.trim();
  if (!str || !/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid token amount format: ${amount}`);
  }

  const negative = str.startsWith("-");
  const unsigned = negative ? str.slice(1) : str;
  const [wholePart, fracPart = ""] = unsigned.split(".");

  if (fracPart.length > TOKEN_DECIMALS) {
    throw new Error(
      `Invalid token amount: at most ${TOKEN_DECIMALS} decimal places are allowed.`,
    );
  }

  const whole = BigInt(wholePart || "0");
  const frac = BigInt(
    (fracPart + "0".repeat(TOKEN_DECIMALS)).slice(0, TOKEN_DECIMALS),
  );
  const total = whole * TOKEN_FACTOR + frac;
  return negative ? -total : total;
}

export function stroopsToXlm(stroops: bigint | string | number): string {
  const value = toBigInt(stroops);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / TOKEN_FACTOR;
  const frac = abs % TOKEN_FACTOR;
  const formatted = `${whole.toString()}.${frac
    .toString()
    .padStart(TOKEN_DECIMALS, "0")}`;
  return negative ? `-${formatted}` : formatted;
}

export function tokenToStroops(amount: string): bigint {
  return xlmToStroops(amount);
}

export function stroopsToToken(stroops: bigint | string | number): string {
  return stroopsToXlm(stroops);
}

export function formatStroops(stroops: bigint | string | number): string {
  const token = stroopsToXlm(stroops);
  const negative = token.startsWith("-");
  const unsigned = negative ? token.slice(1) : token;
  const [whole, frac = ""] = unsigned.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmedFrac = frac.replace(/0+$/, "");
  const body = trimmedFrac ? `${groupedWhole}.${trimmedFrac}` : groupedWhole;
  return negative ? `-${body}` : body;
}

export interface ScheduleValidation {
  valid: boolean;
  totalStroops: bigint;
  errors: string[];
}

export function validateSchedule(
  milestones: { amount: string; description: string }[],
): ScheduleValidation {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return {
      valid: false,
      totalStroops: 0n,
      errors: ["At least one milestone is required."],
    };
  }

  const errors: string[] = [];
  let totalStroops = 0n;

  if (milestones.length > MAX_MILESTONES) {
    errors.push(`No more than ${MAX_MILESTONES} milestones are allowed.`);
  }

  milestones.forEach((milestone, index) => {
    const label = `Milestone ${index + 1}`;
    const description = (milestone?.description ?? "").trim();

    if (!description) {
      errors.push(`${label} needs a description.`);
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `${label} description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
      );
    }

    try {
      const stroops = tokenToStroops(milestone?.amount ?? "");
      if (stroops <= 0n) {
        errors.push(`${label} amount must be greater than zero.`);
      } else {
        totalStroops += stroops;
      }
    } catch {
      errors.push(`${label} amount is not a valid token amount.`);
    }
  });

  if (totalStroops > MAX_TOTAL_STROOPS) {
    errors.push("Total escrow amount is above the allowed limit.");
  }

  return { valid: errors.length === 0, totalStroops, errors };
}
