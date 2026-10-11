# Supabase Setup

Belay uses Supabase (Postgres + Realtime) to sync agreements and milestones
across the client and freelancer. It is optional for local single-browser use but
required for multi-user sync.

## 1. Create a project
1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. Wait for it to finish provisioning.

## 2. Load the schema
1. Open **SQL Editor** in your project.
2. Paste the full contents of [`supabase-setup.sql`](../supabase-setup.sql) and run it.
3. This creates the tables, the **Row Level Security (RLS)** policies, the
   `public.belay_wallet()` identity helper, and the auth shared-state tables.

Tables created:

| Table | Purpose |
|---|---|
| `users` | Wallet-keyed display profiles. |
| `agreements` | One row per agreement (`id`, `client_wallet`, `freelancer_wallet`, `title`, `status`, `total_stroops`, funding metadata). |
| `milestones` | One row per milestone (`agreement_id`, `idx`, `amount_stroops`, `description`, `due_at`, `status`, `evidence`, `tx_hash`). |
| `auth_nonces` | Shared single-use challenge guard. |
| `auth_rate_limits` | Shared sign-in rate-limit window. |
| `revoked_tokens` / `revoked_wallets` | Sign-out denylist. |

## 3. Get your keys
Project Settings → **API**:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Add both to `.env.local`. The anon key is safe to expose **only** because RLS
governs every row — see the security note below.

The server-only secrets (`SUPABASE_JWT_SECRET`, `AUTH_CHALLENGE_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`) are covered in
[AUTHENTICATION_SETUP.md](./AUTHENTICATION_SETUP.md).

## 4. Enable Realtime
Database → Replication (or Realtime) → enable it for the `agreements` and
`milestones` tables so both sides see funding, submissions, and releases live.

## ⚠️ Security: prove your RLS before going to production
The anon key is public, so RLS is your **only** access wall. Before real users:
1. Confirm RLS is **enabled** on every table.
2. Write a test that, using only the anon key, tries to read/modify an agreement
   or milestone that belongs to a different wallet and **asserts it fails**. Add
   it to CI.
3. Tie policies to a verified identity, not a client-supplied wallet field. Every
   policy resolves identity through `public.belay_wallet()`, which returns the
   `wallet_address` claim of a JWT that only `/api/auth/verify` can mint (see
   [ARCHITECTURE_AND_LIMITATIONS.md](./ARCHITECTURE_AND_LIMITATIONS.md)).

Use **separate Supabase projects** for testnet-staging and mainnet-production —
never share a database between environments.
