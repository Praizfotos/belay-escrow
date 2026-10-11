# Belay Release Checklist

Date: 2026-10-11

## Pre-release Quality

- [ ] Install dependencies with `npm ci` / `npm install`
- [ ] Frontend lint passes: `npm run lint`
- [ ] Frontend tests pass: `npm test -- --runInBand`
- [ ] Production build passes: `npm run build`
- [ ] Contract tests pass: `cd contract && cargo test`

## Contract and Deployment

- [ ] Belay agreement contract deployed to testnet
- [ ] Escrow vault contract deployed to testnet
- [ ] Vault initialized with `init_vault(admin, controller=<Belay contract>, token)`
- [ ] Agreement contract initialized with `init(admin, vault=<vault contract>)`
- [ ] End-to-end fund → release proof transaction recorded on testnet
- [ ] `NEXT_PUBLIC_CONTRACT_ID` set in `.env.local`
- [ ] `NEXT_PUBLIC_VAULT_CONTRACT_ID` set in `.env.local`
- [ ] `NEXT_PUBLIC_ESCROW_TOKEN_ID` set in `.env.local`
- [ ] Agreement contract's stored vault address (`get_vault`) matches `NEXT_PUBLIC_VAULT_CONTRACT_ID`
- [ ] Upgrade/admin authority documented (or handed to a timelock/multisig) — see [RUNBOOK.md](./RUNBOOK.md)
- [ ] Explorer links documented in README

## CI/CD

- [ ] CI workflow defined in `.github/workflows/ci.yml`
- [ ] Production check workflow defined in `.github/workflows/production-check.yml`
- [ ] The three `NEXT_PUBLIC_*` contract values set as CI repository variables
- [ ] CI badge added to README

## Documentation

- [ ] README includes live demo link
- [ ] README includes contract IDs and transaction proofs
- [ ] README includes vault address proof
- [ ] README includes deployment screenshot (`public/deployment.png`)
- [ ] README includes submission checklist evidence section
- [ ] Final docs package added under `docs/`

## Auth Shared State (required before any multi-instance deploy)

- [ ] `supabase-setup.sql` re-applied so `auth_nonces` and `auth_rate_limits`
      exist
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set as a server-only env var (never
      `NEXT_PUBLIC_`) in every deployment environment
- [ ] `AUTH_CHALLENGE_SECRET` set in production and different from
      `SUPABASE_JWT_SECRET`
- [ ] Verified a signed challenge cannot be replayed: post the same
      `/api/auth/verify` body twice and confirm the second attempt is rejected
- [ ] Confirmed `CHALLENGE_TTL_SECONDS` is 60 — it is the replay window whenever
      the shared store is unavailable

## RLS / Trigger Breach Tests (required before production)

- [ ] Confirmed RLS is enabled on `users`, `agreements`, and `milestones`
- [ ] A test using only the anon key cannot read or modify another wallet's
      agreement/milestone
- [ ] Column-validation triggers for agreement/milestone updates are present
      and reject identity/counterparty rewrites

## Submission Gate

- [ ] Public GitHub repository ready
- [ ] Commit history exceeds minimum requirement
- [ ] Add one explicit mobile viewport screenshot (phone-sized capture) and reference it in README before final submission

Notes:
- Run the portal's end-to-end checklist against a testnet deployment, not just
  local.
- One manual evidence item is easy to forget: a dedicated phone viewport
  screenshot.
