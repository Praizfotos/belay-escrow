import * as fs from "fs";
import * as path from "path";

const SETUP_SQL = path.resolve(__dirname, "../../supabase-setup.sql");
const sqlContent = fs.readFileSync(SETUP_SQL, "utf8");

/**
 * Every function supabase-setup.sql is expected to define. A function that
 * disappears (rename, bad merge) must fail here, not surface as a mysterious
 * 404 in an RLS policy at runtime.
 */
const EXPECTED_FUNCTIONS = [
  "public.belay_token_revoked",
  "public.belay_wallet",
  "public.belay_revoke_token",
  "public.belay_revoke_wallet",
  "public.belay_purge_revoked_tokens",
  "public.update_updated_at_column",
  "public.validate_user_update",
  "public.resolve_user_profile",
  "public.auth_consume_nonce",
  "public.auth_rate_limit",
];

/** Splits the file into one chunk per `CREATE OR REPLACE FUNCTION`. */
function functionChunks(): { name: string; header: string }[] {
  return sqlContent
    .split(/CREATE OR REPLACE FUNCTION/i)
    .slice(1)
    .map((chunk) => {
      // Isolate the function header before the function body begins.
      const header = chunk.split(/\$\$|\$body\$/i)[0];
      const nameMatch = header.match(/^\s*([a-zA-Z0-9_\.]+)/);
      return { name: nameMatch ? nameMatch[1] : "unknown", header };
    });
}

describe("Supabase Function search_path Security Lint (Issue #50)", () => {
  it("defines every function the app and its RLS policies depend on", () => {
    const names = functionChunks().map((f) => f.name);
    for (const expected of EXPECTED_FUNCTIONS) {
      expect(names).toContain(expected);
    }
  });

  it("pins search_path on belay_wallet and every function in supabase-setup.sql", () => {
    const funcs = functionChunks();

    expect(funcs.length).toBeGreaterThan(0);

    const missingSearchPath: string[] = [];

    for (const { name, header } of funcs) {
      const hasSearchPath = /search_path\s*=/i.test(header);
      if (!hasSearchPath) {
        missingSearchPath.push(name);
      }
    }

    expect(missingSearchPath).toEqual([]);
  });

  it.each(EXPECTED_FUNCTIONS)(
    "pins %s to the hardened search_path (empty or public+pg_temp only)",
    (funcName) => {
      const func = functionChunks().find((f) => f.name === funcName);
      expect(func).toBeDefined();
      // Pinned explicitly to an empty path or the trusted schema only — never
      // the writable default `"$user", public` that an attacker could shadow,
      // and never `public` without pg_temp ordering the same guarantee.
      expect(func!.header).toMatch(
        /SET\s+search_path\s*=\s*(?:''|public\s*,\s*pg_temp)/i,
      );
    },
  );

  it("verifies belay_wallet pins a hardened, explicit search_path", () => {
    // Match belay_wallet definition
    const belayWalletMatch = sqlContent.match(
      /CREATE OR REPLACE FUNCTION public\.belay_wallet\(\)[\s\S]*?\$\$/i,
    );

    expect(belayWalletMatch).not.toBeNull();
    const header = belayWalletMatch![0];
    expect(header).toMatch(
      /SET\s+search_path\s*=\s*(?:''|public\s*,\s*pg_temp)/i,
    );
  });
});

describe("RLS invariants for the wallet-scoped tables", () => {
  const RLS_TABLES = [
    "users",
    "agreements",
    "milestones",
    "public.revoked_wallets",
    "public.revoked_tokens",
    "public.auth_nonces",
    "public.auth_rate_limits",
  ] as const;

  it.each(RLS_TABLES)("enables row level security on %s", (table) => {
    const escaped = table.replace(".", "\\.");
    expect(sqlContent).toMatch(
      new RegExp(`ALTER TABLE ${escaped} ENABLE ROW LEVEL SECURITY`, "i"),
    );
  });

  it("routes every agreements/milestones policy through belay_wallet()", () => {
    // Extract each CREATE POLICY ... ; statement for the two escrow tables and
    // require the wallet resolver inside it: a policy that forgets the call
    // grants access on something other than the proven wallet identity.
    const policyRe =
      /CREATE POLICY\s+"[^"]+"\s+ON\s+(agreements|milestones)\b[\s\S]*?;/gi;
    const policies = [...sqlContent.matchAll(policyRe)].map((m) => m[0]);

    expect(policies.length).toBeGreaterThanOrEqual(6);
    for (const policy of policies) {
      expect(policy).toMatch(/public\.belay_wallet\(\)/i);
    }
  });
});
