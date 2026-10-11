# Belay Production Runbook

## 1. Prerequisites

- Node.js 18+
- npm 9+
- Rust toolchain with the `wasm32v1-none` target (for contract work)
- Stellar CLI (for deployment operations)
- Funded Stellar testnet account
- Supabase project with schema from `supabase-setup.sql`

## 2. Environment Setup

Create `.env.local` and set the public values:

- `NEXT_PUBLIC_STELLAR_NETWORK=TESTNET`
- `NEXT_PUBLIC_HORIZON_URL`
- `NEXT_PUBLIC_STELLAR_EXPLORER`
- `NEXT_PUBLIC_SOROBAN_RPC_URL`
- `NEXT_PUBLIC_CONTRACT_ID` — the Belay agreement contract
- `NEXT_PUBLIC_VAULT_CONTRACT_ID` — the escrow vault contract
- `NEXT_PUBLIC_ESCROW_TOKEN_ID` — the SEP-41 token (USDC SAC on testnet) the vault custodies
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only (must **not** carry the `NEXT_PUBLIC_` prefix — that would publish
them in the browser bundle and let anyone mint a token for any wallet):

- `SUPABASE_JWT_SECRET` — Supabase → Settings → API → JWT Secret. Required;
  without it `/api/auth/verify` returns 503 and no database call is authorized.
- `AUTH_CHALLENGE_SECRET` — **required in production**, and must differ from
  `SUPABASE_JWT_SECRET`. The server refuses to boot without it, so a missing
  value fails the deploy rather than the first sign-in. Falls back to the JWT
  secret outside production only.
- `AUTH_SESSION_TTL_SECONDS` — optional, default 43200 (12h), capped at 86400.
- `SUPABASE_SERVICE_ROLE_KEY` — required on any multi-instance deploy. Backs the
  shared replay guard, rate limiter, and revocation.

Set the same server-only values in the deployment environment (Vercel → Project
Settings → Environment Variables, or equivalent), not just in `.env.local`.

## 3. Local Validation

Run in project root:

- `npm run lint`
- `npm test -- --runInBand`
- `npm run build`

Run contract tests:

- `cd contract && cargo test`

## 4. Contract Deployment (Testnet)

Both contracts live in the `belay-contract` crate, so one WASM carries both
specs. Use the provided script:

```bash
rustup target add wasm32v1-none
cargo install --locked stellar-cli
chmod +x scripts/deploy-contract.sh
./scripts/deploy-contract.sh <secret-key-or-alias> <ESCROW_TOKEN_ID>
```

The script:

1. Builds `belay-contract` (release, optimized).
2. Deploys the agreement contract and the vault contract (same WASM, two
   addresses).
3. Calls `init_vault(admin, controller=<Belay contract>, token)`.
4. Calls `init(admin, vault=<vault contract>)`.
5. Prints the three env values to paste into `.env.local`.

The Belay contract is the vault's **controller** — only it may release or refund,
which keeps custody and milestone rules in a single authorization path. To change
it later, call the vault's `set_controller`.

## 5. CI/CD Verification

- Ensure workflow files exist and are valid:
  - `.github/workflows/ci.yml`
  - `.github/workflows/production-check.yml`
- Confirm the CI badge resolves in README.
- Confirm repo settings enforce checks on PRs (manual GitHub setting).

## 6. Release Documentation Pack

Before submission, verify:

- README is up to date
- `docs/RELEASE_CHECKLIST.md` current
- `docs/REQUIREMENT_PROOF_MATRIX.md` current
- `docs/ARCHITECTURE_AND_LIMITATIONS.md` current

## 7. Incident / Rollback Basics

If a production-like issue occurs:

1. Stop deployment changes.
2. Re-run lint/test/build and contract tests.
3. Validate the three contract env values in `.env.local`.
4. Compare README proof IDs/tx hashes against the explorer.
5. If a contract ID is wrong (or the wrong token was bound at `init_vault`),
   redeploy and update env + docs consistently. The vault's token can only be
   changed with `set_token` while no funds are locked.
6. If signers cannot act on the agreements contract, confirm the vault address
   stored in it (`get_vault`) matches `NEXT_PUBLIC_VAULT_CONTRACT_ID` and fix it
   with `set_vault`.
