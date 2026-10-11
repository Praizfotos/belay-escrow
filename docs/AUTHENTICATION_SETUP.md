# Authentication

## How it works

Belay uses **wallet-based identity** backed by a real ownership challenge. The
wallet is the account — there is no password and no email.

1. The user connects a Stellar wallet, so the app learns their public key (`G…`).
2. The app asks the server for a challenge at `/api/auth/challenge`. The server
   builds a SEP-10-style transaction with sequence number `0` (which the network
   can never accept) and binds the nonce to the wallet and an expiry with an
   HMAC.
3. The wallet **signs** that challenge. This is the proof of key ownership.
4. `/api/auth/verify` checks the signature against the claimed public key, then
   mints a short-lived Supabase JWT carrying a `wallet_address` claim and a
   unique `jti`.
5. Every Supabase call goes through an authenticated client created for that
   wallet ([lib/supabase/session.ts](../lib/supabase/session.ts)), which attaches
   that JWT. RLS resolves identity through `public.belay_wallet()`.
6. The profile is cached in `localStorage` (`belay:user`) and the token in
   `belay:session`, so a refresh does not flash logged-out and the wallet can
   re-sign silently before expiry.

Sessions last one hour by default (`AUTH_SESSION_TTL_SECONDS`, capped at 12
hours) and are re-signed silently before they expire.

## Sign-out and revocation

Every token carries a `jti`. Signing out writes that id to
`public.revoked_tokens`, and `public.belay_wallet()` returns NULL for a revoked
token, so it matches no row on any table. "Sign out everywhere" writes a
wallet-wide tombstone that denies every token issued at or before that moment.

If the denylist write fails, the app still clears the local session but surfaces
a warning: the token remains valid until it expires, which is why the session
lifetime is kept short.

## Configuration

Server-only env vars, all listed in
[.env.local.example](../.env.local.example) — none may be prefixed
`NEXT_PUBLIC_`:

- `SUPABASE_JWT_SECRET` — signs the access tokens RLS authorizes on. Required;
  without it `/api/auth/verify` returns 503.
- `AUTH_CHALLENGE_SECRET` — binds a nonce to its wallet. **Required in
  production**, where it must differ from `SUPABASE_JWT_SECRET`: the server
  refuses to boot otherwise. Keeping the keys separate means a leak in one path
  does not compromise the other, and rotating the JWT secret does not silently
  invalidate every outstanding challenge. Outside production it falls back to
  the JWT secret so a local checkout runs with one value set.
- `AUTH_SESSION_TTL_SECONDS` — optional session lifetime, default 12h.
- `SUPABASE_SERVICE_ROLE_KEY` — **required on any multi-instance deployment.**
  It backs the shared replay guard and rate limiter (`auth_nonces`,
  `auth_rate_limits`) and the revocation tables. Without it all three fall back
  to per-process memory, so a captured challenge can be replayed against another
  serverless instance within the 60-second challenge TTL and the 30/min limit
  becomes 30/min *per instance*.

Ensure the `users`, `agreements`, `milestones` tables, their RLS policies, and
the auth shared-state tables from [supabase-setup.sql](../supabase-setup.sql) are
loaded.
