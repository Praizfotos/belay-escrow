# Architecture Assumptions and Known Limitations

## Architecture Summary

Belay uses:

- Next.js + TypeScript frontend
- Next.js route handlers (`/api/auth/*`) for SEP-10 style wallet authentication
- Supabase for app data and realtime sync
- A **Soroban escrow vault contract** that custodies a SEP-41 token (USDC on
  testnet by default) for the lifetime of an agreement
- A **Soroban agreement contract** that records milestones and rules, and is the
  vault's only authorized controller

The two contracts are deployed from a single `belay-contract` crate and work as a
pair: the agreement contract decides *when* money moves; the vault contract is
the only code that *holds* it. The vault's `fund`/`release`/`refund` entry points
require authorization from the agreement contract, resolved on-chain, so tokens
can only move along a path the milestone rules allow.

## Key Assumptions

- Users operate on Stellar testnet, not mainnet.
- Wallet extensions (Freighter, xBull, Lobstr) are available client-side.
- The escrow token is a standard SEP-41 contract the client's account can hold a
  trustline for. Bitcoin-style "no token" custody is **not** supported; the
  chosen token is whatever `NEXT_PUBLIC_ESCROW_TOKEN_ID` points at.
- Supabase anon key is safe with proper RLS policies. It carries no identity of
  its own: RLS authorizes on the `wallet_address` claim of a JWT that
  `/api/auth/verify` signs with `SUPABASE_JWT_SECRET`, and that secret is only
  ever read server-side.
- `SUPABASE_JWT_SECRET` (and `AUTH_CHALLENGE_SECRET`, when set) are configured
  as server-only environment variables. Prefixing either with `NEXT_PUBLIC_`
  would let any visitor mint a token for any wallet.
- Contract IDs in env/docs are synchronized with deployed testnet contracts.

## Authentication Model

- A wallet proves key ownership by signing a server-issued challenge
  transaction built with sequence number 0, which the network can never accept.
- The challenge nonce is bound to the wallet and an expiry by an HMAC, so the
  handshake needs no shared session store. Single use is enforced separately in
  Postgres (`auth_nonces`) so the guard holds across serverless instances.
- The auth routes are rate limited through a shared Postgres window
  (`auth_rate_limits`), so the configured 30 requests/minute is the real limit
  rather than 30 per running instance.
- On success the server mints a Supabase JWT carrying `wallet_address`. Every
  RLS policy reads it through `public.belay_wallet()`; requests without a valid
  token match no rows.
- Sessions are cached in `localStorage` (`belay:session`) and last 12 hours by
  default (`AUTH_SESSION_TTL_SECONDS`, capped at 12 hours). They re-sign silently
  before expiry, so the lifetime is largely invisible in normal use.
- Every token carries a `jti`. Signing out writes that id to
  `public.revoked_tokens`, and `belay_wallet()` — the one function every RLS
  policy resolves identity through — returns NULL for a revoked token, so it
  matches no row on any table. "Sign out everywhere" writes a wallet-wide
  tombstone that denies every token issued at or before that moment.

## Known Limitations

- Project is testnet-oriented; mainnet operational controls are not included.
- **Centralized dispute resolution.** A single admin/arbitrator address can
  resolve disputes and (through the agreement contract) release or refund locked
  funds. This is a deliberate MVP trade-off, but it means the escrow is **not**
  trust-minimized: users are trusting that key to act honestly. A production
  design would use a multi-sig arbitrator set, an appeal window, or a staked
  juror pool.
- **Admin upgrade authority.** The account that deployed the contracts can
  upgrade the WASM (and the vault admin can call `set_controller`/`set_token`).
  Until this is renounced or handed to a timelock/multisig, the operator can
  change the rules. See [RUNBOOK.md](./RUNBOOK.md) for the intended post-launch
  handoff.
- **Vault-controller coupling is a single point of trust.** Because the
  agreement contract is the vault's controller, a bug in the milestone rules
  becomes a bug in custody. The inter-contract tests exercise the
  fund/release/refund paths, but the contracts are unaudited.
- **`refund_overdue_milestone` requires a deadline.** Milestones created without
  `due_at` cannot be auto-refunded; an overdue refund depends on the client
  calling it, or a dispute being resolved by the arbitrator.
- **Deadline is a timestamp, not a clock the contract enforces continuously.**
  Anyone can call the refund entry point after `due_at`; the contract does not
  push funds automatically.
- README still needs one explicit phone viewport screenshot for final checklist
  completeness.
- CI merge protection enforcement is a GitHub repository setting and must be
  enabled manually in repo settings.
- Wallet UX depends on extension behavior and user approval flow, including the
  per-session signature that establishes an authenticated session and the
  `changeTrust` the payer signs once to enable the escrow token.
- **Serverless replay and rate-limit state — conditionally mitigated.** The
  durable mitigation is implemented by the `auth_nonces` and `auth_rate_limits`
  tables/RPCs in `supabase-setup.sql`, but it is active only when that schema is
  deployed and `SUPABASE_SERVICE_ROLE_KEY` is configured. Without both, the
  guards fall back to process memory: a captured challenge can be replayed
  against a sibling instance for the rest of the 60-second challenge TTL, and
  the effective limit becomes 30 requests/minute times the instance count. Treat
  the service-role key and current schema as required for every
  multi-instance/serverless deployment; the in-memory path is suitable only for
  local or single-process use.
- If the shared store is configured but unreachable, the replay guard fails
  closed: `/api/auth/verify` returns 503 rather than minting a token it cannot
  prove is single-use. The rate limiter deliberately falls back to its local
  window so a database outage does not block every sign-in. That fallback is
  weaker across instances and is not a substitute for an edge/WAF rate limit.
- **Token revocation — conditionally mitigated.** Current schema and route code
  maintain `revoked_tokens` and `revoked_wallets`, and `belay_wallet()` denies
  revoked JWTs. This depends on the same service-role configuration and current
  `supabase-setup.sql`; without them server-side sign-out returns 503 and a
  leaked bearer token remains valid until expiry. Keep
  `AUTH_SESSION_TTL_SECONDS` short enough for that residual risk.
- **RLS has no column-level protection by itself — mitigated by database
  triggers, but deployment-dependent.** The agreement and milestone UPDATE
  policies intentionally authorize a counterparty at row level. The current
  schema adds validation `BEFORE UPDATE` triggers: counterparty/identity fields
  are immutable, and status transitions are constrained (a milestone cannot be
  moved to `released` by a client-side update that skips the on-chain path).
  These checks exist only after the latest `supabase-setup.sql` has been
  applied; older deployments that have only the RLS policies still allow an
  authorized counterparty to rewrite every column in the row. Schema version
  checks and RLS/trigger breach tests are therefore required before production
  use.
- **Database and ledger can disagree.** The app is the source of truth for the
  agreement/milestone *view*; the chain is the source of truth for *custody*.
  If a release transaction succeeds but the follow-up Supabase write fails, the
  UI may briefly show a milestone as unreleased while the tokens have already
  moved. The UI reconciles on the next read/realtime event, but never treat the
  database as proof that funds moved — the transaction on the explorer is the
  evidence.
- Some screenshots in README are desktop captures; mobile screenshots should be
  added for evaluator clarity.

## Operational Constraints

- Any contract redeployment changes both contract IDs and requires env + README
  updates.
- Incorrect wallet/account setup (missing trustline, unfunded account, wrong
  network) can block end-to-end escrow tests.
- Supabase configuration errors can affect sync behavior even if chain
  operations work.

## Recommended Future Improvements

- Replace the single arbitrator with a multi-sig set or an appeal/staking based
  dispute mechanism, and put the upgrade authority behind a timelock or multisig.
- Add automated e2e tests (Playwright) with mobile viewport assertions covering
  fund → submit → approve and fund → submit → refund.
- Add a script to validate README proof links are live.
- Add an automated checklist CI job that verifies required docs/sections exist.
- Add a deployment health check that verifies the shared auth RPCs, revocation
  tables, validation triggers, and that the agreement contract's stored vault
  address matches `NEXT_PUBLIC_VAULT_CONTRACT_ID` before serving production
  traffic.
- Emit and index vault `fund`/`release`/`refund` events into the database so the
  UI can reconcile from chain rather than only from the app's own writes.
- Sweep expired `auth_nonces` / `auth_rate_limits` rows on a schedule (pg_cron)
  as well as opportunistically inside the RPCs.
- Prefer narrowly scoped RPCs for milestone update operations so callers do not
  need broad row-level UPDATE permission; keep the validation triggers as
  defense in depth.
