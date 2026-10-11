-- ============================================================================
-- Belay - Supabase Database Setup
-- ============================================================================
-- Belay is a freelance milestone escrow dApp on Stellar Soroban (rebrand of
-- Belay). A client and a freelancer agree a set of milestones. The client
-- funds the agreement with a SEP-41 token (USDC testnet by default); the tokens
-- are held by an on-chain vault contract. The freelancer submits a milestone,
-- the client approves it, and the vault releases that milestone's tokens.
-- Disputes are escalated to an arbitrator/admin, and the client can cancel or
-- refund. This database mirrors that on-chain state for fast reads, realtime
-- updates and offline-friendly queries; the chain remains the source of truth.
--
-- The wallet-based auth machinery (signed challenge -> JWT -> `belay_wallet()`
-- identity used by every RLS policy) is hardened and intentionally preserved.
--
-- ✅ SAFE TO RUN MULTIPLE TIMES - This script is fully idempotent
-- It will create new objects or update existing ones without errors
--
-- Instructions:
-- 1. Go to: Supabase Dashboard → SQL Editor → New Query
-- 2. Copy & paste this entire file
-- 3. Click "Run" or press Ctrl+Enter
-- ============================================================================

-- ============================================================================
-- 1. CREATE TABLES
-- ============================================================================

-- Create users table (for wallet-based authentication). Shape is unchanged from
-- Belay: the wallet address is the primary identity, display_name is required.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    wallet_address TEXT UNIQUE NOT NULL, -- Stellar wallet address (primary identifier)
    display_name TEXT NOT NULL, -- User's display name (required)
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_login_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Update users table schema (keep display_name required, remove email if exists)
DO $$ 
BEGIN
    -- Set default value for any existing NULL display_name values (only if rows exist)
    IF EXISTS (SELECT 1 FROM users LIMIT 1) THEN
        UPDATE users SET display_name = 'User' WHERE display_name IS NULL OR display_name = '';
    END IF;
    
    -- Make display_name NOT NULL if it's currently nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'display_name' AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
    END IF;

    -- Drop email column only if it actually exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
    ) THEN
        ALTER TABLE users DROP COLUMN email;
    END IF;
END $$;

-- Create agreements table. One row per on-chain agreement.
CREATE TABLE IF NOT EXISTS agreements (
    id TEXT PRIMARY KEY,                              -- agreement id (matches on-chain id)
    client_wallet TEXT NOT NULL,                      -- Stellar address of the client (funder)
    freelancer_wallet TEXT NOT NULL,                  -- Stellar address of the freelancer (payee)
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'funded', 'completed', 'cancelled')),
    total_stroops NUMERIC NOT NULL DEFAULT 0,         -- total escrow amount, in stroops
    funded_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    create_tx_hash TEXT,                              -- nullable on-chain tx hash for create_agreement
    fund_tx_hash TEXT                                 -- nullable on-chain tx hash for fund_agreement
);

-- Create milestones table. Ordered milestone schedule for an agreement.
CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,                              -- milestone id
    agreement_id TEXT NOT NULL
        REFERENCES agreements (id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,                             -- 0-based position within the agreement
    amount_stroops NUMERIC NOT NULL,
    description TEXT NOT NULL,
    due_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'submitted', 'released', 'refunded', 'disputed')),
    evidence TEXT,
    submit_tx_hash TEXT,                              -- nullable on-chain tx hash for submit_milestone
    release_tx_hash TEXT,                             -- nullable on-chain tx hash for approve/refund/resolve
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (agreement_id, idx)
);

-- ============================================================================
-- 1.5. REMOVE LEGACY Belay DOMAIN
-- ============================================================================
-- The trips/expenses domain is replaced by agreements/milestones. Drop the old
-- tables (CASCADE clears their dependent policies/triggers/indexes) and the
-- helper functions that no longer apply. The `users` table and the auth
-- machinery are kept; only the brand-specific function names are migrated below.

-- Drop legacy `users` policies first: they reference belay_wallet(), which
-- must be gone before we can drop/replace it (and they are recreated under the
-- Belay name later in this script).
DROP POLICY IF EXISTS "Anyone can view users" ON users;

DROP POLICY IF EXISTS "Authenticated wallets can view users" ON users;

DROP POLICY IF EXISTS "Users can view their own profile or counterparties" ON users;

DROP POLICY IF EXISTS "Users can insert their own profile" ON users;

DROP POLICY IF EXISTS "Users can update their own profile" ON users;

DROP POLICY IF EXISTS "Allow all operations on users" ON users;

-- Drop the legacy validation trigger before dropping its function.
DROP TRIGGER IF EXISTS validate_users_update ON users;

-- Drop the legacy tables from the previous Belay domain.
DROP TABLE IF EXISTS public.expenses CASCADE;

DROP TABLE IF EXISTS public.trips CASCADE;

-- Drop legacy domain functions that no longer apply.
DROP FUNCTION IF EXISTS public.mark_share_paid (UUID, TEXT, TEXT);

DROP FUNCTION IF EXISTS public.get_pending_invitations ();

DROP FUNCTION IF EXISTS public.accept_invitation (TEXT, UUID);

DROP FUNCTION IF EXISTS public.assert_valid_expense_payload (
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    JSONB,
    JSONB,
    TEXT,
    TEXT[]
);

DROP FUNCTION IF EXISTS public.validate_expense_insert ();

DROP FUNCTION IF EXISTS public.validate_expense_update ();

DROP FUNCTION IF EXISTS public.validate_trip_insert ();

DROP FUNCTION IF EXISTS public.validate_trip_update ();

DROP FUNCTION IF EXISTS public.bump_expense_version ();

DROP FUNCTION IF EXISTS public.validate_user_update ();

DROP FUNCTION IF EXISTS public.resolve_user_profile (TEXT);

-- Drop the brand-specific functions so they can be recreated as `belay_*`.
-- Order matters: the SQL-language belay_wallet() references
-- belay_token_revoked(), so it is dropped first.
DROP FUNCTION IF EXISTS public.belay_wallet ();

DROP FUNCTION IF EXISTS public.belay_token_revoked (TEXT, TEXT, BIGINT);

DROP FUNCTION IF EXISTS public.belay_revoke_token (TEXT, TEXT, TIMESTAMPTZ);

DROP FUNCTION IF EXISTS public.belay_revoke_wallet (TEXT);

DROP FUNCTION IF EXISTS public.belay_purge_revoked_tokens ();

-- ============================================================================
-- 2. CREATE INDEXES (for better query performance)
-- ============================================================================

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users (wallet_address);

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

-- Indexes for agreements
CREATE INDEX IF NOT EXISTS idx_agreements_client_wallet ON agreements (client_wallet);

CREATE INDEX IF NOT EXISTS idx_agreements_freelancer_wallet ON agreements (freelancer_wallet);

CREATE INDEX IF NOT EXISTS idx_agreements_status ON agreements (status);

CREATE INDEX IF NOT EXISTS idx_agreements_created_at ON agreements (created_at DESC);

-- Indexes for milestones
CREATE INDEX IF NOT EXISTS idx_milestones_agreement_id ON milestones (agreement_id);

CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones (status);

-- ============================================================================
-- 3. ENABLE ROW LEVEL SECURITY & CREATE ACCESS POLICIES
-- ============================================================================
-- Authorization is based on the `wallet_address` claim of the request's JWT.
--
-- That token is minted by /api/auth/verify only after the caller has signed a
-- server-issued challenge transaction with their Stellar private key, and it is
-- signed with the project's JWT secret — which never leaves the server. A
-- caller therefore cannot pick their own identity.
--
-- This replaces the earlier `x-wallet-address` request header, which was set
-- purely client-side and could be forged by anyone holding the (public) anon
-- key. Any deployment still running those policies has no access control at
-- all — re-run this script to replace them.
-- ============================================================================

-- Enable RLS on all tables (required before creating policies)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

-- ── Identity helper ─────────────────────────────────────────────────────────
-- Returns the Stellar address the request proved control of, or NULL when the
-- request carries no verified wallet. NULL never equals anything, so every
-- policy below denies by default for unauthenticated callers.

-- Revoked token ids. A row here means the token was signed out (or revoked
-- for the whole wallet) before its `exp`, so it must stop working immediately.
-- Rows are purged once the token they deny would have expired anyway.
CREATE TABLE IF NOT EXISTS public.revoked_tokens (
    jti TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON public.revoked_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_wallet ON public.revoked_tokens (wallet_address);

-- "Sign out everywhere" tombstones. A token is denied when it was issued at or
-- before `revoked_before`, which covers tokens this server never saw the id of.
CREATE TABLE IF NOT EXISTS public.revoked_wallets (
    wallet_address TEXT PRIMARY KEY,
    revoked_before TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_wallets_expires_at ON public.revoked_wallets (expires_at);

ALTER TABLE public.revoked_wallets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.revoked_wallets FROM anon, authenticated;

-- Written only by the server (service role key). RLS on with no policies means
-- anon and authenticated match no rows, so a stolen token cannot un-revoke
-- itself by deleting its own row.
ALTER TABLE public.revoked_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.revoked_tokens FROM anon, authenticated;

-- Reading the denylist has to work for callers who cannot read the table, so
-- the lookup is wrapped in a SECURITY DEFINER function that exposes exactly one
-- boolean and nothing else.
CREATE OR REPLACE FUNCTION public.belay_token_revoked (
    p_jti TEXT,
    p_wallet_address TEXT,
    p_issued_at BIGINT
) RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET
    search_path = public, pg_temp AS $$
  SELECT
    -- This exact token was signed out...
    EXISTS (SELECT 1 FROM public.revoked_tokens WHERE jti = p_jti)
    -- ...or it predates a "sign out everywhere" for the same wallet.
    OR EXISTS (
        SELECT 1 FROM public.revoked_wallets w
        WHERE w.wallet_address = p_wallet_address
          AND p_issued_at IS NOT NULL
          AND TO_TIMESTAMP(p_issued_at) <= w.revoked_before
    );
$$;

GRANT
EXECUTE ON FUNCTION public.belay_token_revoked (TEXT, TEXT, BIGINT) TO anon,
authenticated;

-- The one identity function every RLS policy routes through. It resolves the
-- proven Stellar wallet from the JWT claims, or NULL when unauthenticated or
-- revoked. NULL equals nothing, so a denied request matches no row anywhere.
CREATE OR REPLACE FUNCTION public.belay_wallet()
RETURNS TEXT
LANGUAGE SQL
STABLE
SET search_path = public, pg_temp
-- No longer PARALLEL SAFE: the revocation check reads a table through a
-- SECURITY DEFINER function.
AS $$
  -- Every RLS policy routes through this one function, so the revocation check
  -- lives here: a revoked token resolves to NULL, and NULL equals nothing, so
  -- it matches no row on any table. Tokens minted before `jti` existed have no
  -- id to deny and stay valid until they expire.
  SELECT NULLIF(
    COALESCE(
      CASE
        WHEN public.belay_token_revoked(
          NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'jti',
          NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'wallet_address',
          (NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'iat')::BIGINT
        ) THEN ''
        ELSE NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'wallet_address'
      END,
      ''
    ),
    ''
  );
$$;

GRANT EXECUTE ON FUNCTION public.belay_wallet() TO anon, authenticated;

-- Revokes one token id. Idempotent: signing out twice is not an error.
CREATE OR REPLACE FUNCTION public.belay_revoke_token (
    p_jti TEXT,
    p_wallet_address TEXT,
    p_expires_at TIMESTAMPTZ
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
    search_path = public, pg_temp AS $$
BEGIN
    DELETE FROM public.revoked_tokens WHERE expires_at <= NOW();

    INSERT INTO public.revoked_tokens (jti, wallet_address, expires_at)
    VALUES (p_jti, p_wallet_address, p_expires_at)
    ON CONFLICT (jti) DO NOTHING;
END;
$$;

-- Revokes every currently-live token for a wallet ("sign out everywhere").
-- Tokens are stateless, so there is no list of outstanding ids to walk; instead
-- a wallet-wide tombstone is written and `belay_wallet()` denies any token
-- issued at or before it.
CREATE OR REPLACE FUNCTION public.belay_revoke_wallet (p_wallet_address TEXT) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
SET
    search_path = public, pg_temp AS $$
DECLARE
    -- Must outlive the longest token AUTH_SESSION_TTL_SECONDS can mint (12h),
    -- or the tombstone would lapse while a denied token is still valid.
    v_max_ttl INTERVAL := INTERVAL '13 hours';
BEGIN
    INSERT INTO public.revoked_wallets (wallet_address, revoked_before, expires_at)
    VALUES (p_wallet_address, NOW(), NOW() + v_max_ttl)
    ON CONFLICT (wallet_address) DO UPDATE
    SET revoked_before = NOW(),
        expires_at = NOW() + v_max_ttl;

    DELETE FROM public.revoked_wallets WHERE expires_at <= NOW();
    RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.belay_revoke_token (TEXT, TEXT, TIMESTAMPTZ)
FROM
    PUBLIC,
    anon,
    authenticated;

REVOKE ALL ON FUNCTION public.belay_revoke_wallet (TEXT)
FROM
    PUBLIC,
    anon,
    authenticated;

GRANT
EXECUTE ON FUNCTION public.belay_revoke_token (TEXT, TEXT, TIMESTAMPTZ) TO service_role;

GRANT
EXECUTE ON FUNCTION public.belay_revoke_wallet (TEXT) TO service_role;

-- Purges denylist rows whose tokens have expired on their own. Called by the
-- server on sign-out; safe to also run from pg_cron.
CREATE OR REPLACE FUNCTION public.belay_purge_revoked_tokens () RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
SET
    search_path = public, pg_temp AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.revoked_tokens WHERE expires_at <= NOW();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.belay_purge_revoked_tokens ()
FROM
    PUBLIC,
    anon,
    authenticated;

GRANT
EXECUTE ON FUNCTION public.belay_purge_revoked_tokens () TO service_role;

-- ============================================================================
-- WALLET-BASED ACCESS CONTROL
-- ============================================================================
-- Only the two counterparties of an agreement can see it; only the client may
-- create and update the agreement and its milestones. Milestones are inserted
-- while the agreement is still being drafted and remain cheap to re-sync.
--
-- Do NOT replace these with `USING (true)` policies, not even temporarily:
-- the anon key is shipped in the browser bundle, so a permissive policy is
-- equivalent to publishing the table.
-- ============================================================================

-- USERS POLICIES --

-- A user can only view their own profile or the profile of a counterparty they
-- share an agreement with. This prevents directory scraping and mass
-- enumeration of user profiles.
CREATE POLICY "Users can view their own profile or counterparties" ON users FOR
SELECT USING (
    -- 1. Caller viewing their own profile
    wallet_address = public.belay_wallet()
    OR
    -- 2. Caller and counterparty are the two sides of the same agreement
    EXISTS (
        SELECT 1 FROM public.agreements e
        WHERE (
            (e.client_wallet = public.belay_wallet() AND e.freelancer_wallet = users.wallet_address)
            OR (e.freelancer_wallet = public.belay_wallet() AND e.client_wallet = users.wallet_address)
        )
    )
);

-- Users can insert their own profile during signup (wallet must match)
CREATE POLICY "Users can insert their own profile" ON users
FOR INSERT
WITH CHECK (
    wallet_address = public.belay_wallet()
);

-- Users can only update their own profile
CREATE POLICY "Users can update their own profile" ON users
FOR UPDATE
USING (
    wallet_address = public.belay_wallet()
)
WITH CHECK (
    wallet_address = public.belay_wallet()
);

-- AGREEMENTS POLICIES --

-- Drop existing policies if they exist (idempotency: CREATE POLICY has no IF NOT EXISTS)
DROP POLICY IF EXISTS "Counterparties can view agreements" ON agreements;

DROP POLICY IF EXISTS "Client can create agreements" ON agreements;

DROP POLICY IF EXISTS "Client can update agreements" ON agreements;

-- The client or the freelancer of an agreement may read it.
CREATE POLICY "Counterparties can view agreements" ON agreements
FOR SELECT
USING (
    client_wallet = public.belay_wallet()
    OR freelancer_wallet = public.belay_wallet()
);

-- Only the client may create an agreement, and only in the initial draft state.
CREATE POLICY "Client can create agreements" ON agreements
FOR INSERT
WITH CHECK (
    client_wallet = public.belay_wallet()
    AND status = 'draft'
);

-- Only the client may update the agreement they own.
CREATE POLICY "Client can update agreements" ON agreements
FOR UPDATE
USING (
    client_wallet = public.belay_wallet()
)
WITH CHECK (
    client_wallet = public.belay_wallet()
);

-- MILESTONES POLICIES --

DROP POLICY IF EXISTS "Counterparties can view milestones" ON milestones;

DROP POLICY IF EXISTS "Client can create milestones" ON milestones;

DROP POLICY IF EXISTS "Client can update milestones" ON milestones;

-- Only the two counterparties of the parent agreement may read its milestones.
CREATE POLICY "Counterparties can view milestones" ON milestones
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.agreements e
        WHERE e.id = milestones.agreement_id
          AND (
              e.client_wallet = public.belay_wallet()
              OR e.freelancer_wallet = public.belay_wallet()
          )
    )
);

-- Only the agreement's client may add milestones, and only as pending.
CREATE POLICY "Client can create milestones" ON milestones
FOR INSERT
WITH CHECK (
    status = 'pending'
    AND EXISTS (
        SELECT 1 FROM public.agreements e
        WHERE e.id = milestones.agreement_id
          AND e.client_wallet = public.belay_wallet()
    )
);

-- Only the agreement's client may update its milestones.
CREATE POLICY "Client can update milestones" ON milestones
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.agreements e
        WHERE e.id = milestones.agreement_id
          AND e.client_wallet = public.belay_wallet()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.agreements e
        WHERE e.id = milestones.agreement_id
          AND e.client_wallet = public.belay_wallet()
    )
);

-- ============================================================================
-- 4. ENABLE REALTIME (for live updates across browsers)
-- ============================================================================
-- Safely add tables to realtime publication (agreements and milestones only).
-- The users table is deliberately excluded from realtime replication to prevent
-- malicious callers from streaming all new signups in real time.

DO $$
BEGIN
    -- Remove users table from realtime if previously added
    IF EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'users'
    ) THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE users;
    END IF;

    -- Add agreements table to realtime if not already added
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE
            pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = 'agreements'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE agreements;
    END IF;

    -- Add milestones table to realtime if not already added
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE
            pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = 'milestones'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE milestones;
    END IF;

END $$;

-- ============================================================================
-- 5. CREATE UPDATED_AT TRIGGERS (Auto-update timestamps)
-- ============================================================================

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

DROP TRIGGER IF EXISTS update_agreements_updated_at ON agreements;

DROP TRIGGER IF EXISTS update_milestones_updated_at ON milestones;

-- Create trigger for users
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for agreements
CREATE TRIGGER update_agreements_updated_at
BEFORE UPDATE ON agreements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for milestones
CREATE TRIGGER update_milestones_updated_at
BEFORE UPDATE ON milestones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 5.5. COLUMN-LEVEL INTEGRITY TRIGGERS
-- ============================================================================
-- Postgres RLS is row-level, not column-level: an UPDATE policy grants write
-- access to every column once the row predicate passes.
-- These BEFORE UPDATE triggers enforce strict column-level authorization:
-- 1. Immutable identifiers (id, created_at, wallet_address) can NEVER be
--    altered by any caller.
-- ============================================================================

-- Trigger function for column-level validation on users
CREATE OR REPLACE FUNCTION public.validate_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller TEXT;
BEGIN
    v_caller := public.belay_wallet();

    IF v_caller IS NULL THEN
        IF current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> '' THEN
            RAISE EXCEPTION 'Unauthorized: invalid or missing wallet session';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'Cannot modify user id';
    END IF;

    IF NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Cannot modify user created_at';
    END IF;

    IF NEW.wallet_address <> OLD.wallet_address THEN
        RAISE EXCEPTION 'Cannot modify user wallet_address';
    END IF;

    RETURN NEW;
END;
$$;

-- Drop existing validation trigger if it exists
DROP TRIGGER IF EXISTS validate_users_update ON users;

-- Create validation trigger
CREATE TRIGGER validate_users_update
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION public.validate_user_update();

-- ============================================================================
-- 5.6. PROFILE RESOLUTION RPC
-- ============================================================================

-- Resolve only the caller's own profile or a counterparty profile from a
-- shared agreement. Stellar addresses are public, so requiring a "known"
-- address alone does not prevent directory enumeration. Also cap lookups per
-- authenticated wallet; this quota is a secondary guard, not the authorization boundary.
CREATE OR REPLACE FUNCTION public.resolve_user_profile(p_wallet_address TEXT)
RETURNS TABLE (
    wallet_address TEXT,
    display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_wallet TEXT;
    v_allowed BOOLEAN;
    v_retry_after INTEGER;
BEGIN
    v_caller_wallet := public.belay_wallet();
    IF v_caller_wallet IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_wallet_address IS NULL OR trim(p_wallet_address) = '' THEN
        RETURN;
    END IF;

    SELECT limit_result.allowed, limit_result.retry_after
    INTO v_allowed, v_retry_after
    FROM public.auth_rate_limit(
        'profile_lookup:' || v_caller_wallet,
        60,
        60000
    ) AS limit_result;

    IF NOT v_allowed THEN
        RAISE EXCEPTION 'Profile lookup rate limit exceeded; retry after % seconds', v_retry_after;
    END IF;

    RETURN QUERY
    SELECT u.wallet_address, u.display_name
    FROM public.users u
    WHERE u.wallet_address = p_wallet_address
      AND (
          u.wallet_address = v_caller_wallet
          OR EXISTS (
              SELECT 1
              FROM public.agreements e
              WHERE (e.client_wallet = v_caller_wallet AND e.freelancer_wallet = u.wallet_address)
                 OR (e.freelancer_wallet = v_caller_wallet AND e.client_wallet = u.wallet_address)
          )
      )
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_user_profile(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_user_profile(TEXT) TO authenticated;

-- ============================================================================
-- 5.7. AUTH SHARED STATE (Replay Guard + Rate Limiting Across Instances)
-- ============================================================================
-- The auth routes run on serverless instances that do not share memory, so a
-- challenge nonce burned in one process means nothing to its siblings and a
-- per-process rate limiter multiplies the real limit by the instance count.
-- Both tables below are written only by the server, using the service role key
-- (SUPABASE_SERVICE_ROLE_KEY) — never the anon key.

CREATE TABLE IF NOT EXISTS public.auth_nonces (
    nonce TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires_at ON public.auth_nonces (expires_at);

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
    key TEXT PRIMARY KEY,
    hits INTEGER NOT NULL,
    reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_reset_at ON public.auth_rate_limits (reset_at);

-- RLS on with no policies: anon and authenticated match no rows at all. The
-- service role bypasses RLS, which is exactly the access the auth routes need.
ALTER TABLE public.auth_nonces ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.auth_nonces FROM anon, authenticated;

REVOKE ALL ON public.auth_rate_limits FROM anon, authenticated;

-- Burns a nonce for every instance at once. Returns TRUE the first time a nonce
-- is seen and FALSE on every replay; the insert is the atomic check, so two
-- concurrent verifies of the same challenge cannot both win.
CREATE OR REPLACE FUNCTION public.auth_consume_nonce (p_nonce TEXT, p_expires_at TIMESTAMPTZ) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET
    search_path = public, pg_temp AS $$
DECLARE
    v_inserted INTEGER;
BEGIN
    DELETE FROM public.auth_nonces WHERE expires_at <= NOW();

    INSERT INTO public.auth_nonces (nonce, expires_at)
    VALUES (p_nonce, p_expires_at)
    ON CONFLICT (nonce) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RETURN v_inserted > 0;
END;
$$;

-- Fixed-window counter shared by every instance. One statement does the read,
-- the increment and the window roll-over, so concurrent callers cannot both
-- read a stale count.
CREATE OR REPLACE FUNCTION public.auth_rate_limit (
    p_key TEXT,
    p_limit INTEGER,
    p_window_ms INTEGER
) RETURNS TABLE (allowed BOOLEAN, retry_after INTEGER) LANGUAGE plpgsql SECURITY DEFINER
SET
    search_path = public, pg_temp AS $$
DECLARE
    v_window INTERVAL := (p_window_ms || ' milliseconds')::INTERVAL;
    v_hits INTEGER;
    v_reset TIMESTAMPTZ;
BEGIN
    DELETE FROM public.auth_rate_limits WHERE reset_at <= NOW();

    INSERT INTO public.auth_rate_limits AS r (key, hits, reset_at)
    VALUES (p_key, 1, NOW() + v_window)
    ON CONFLICT (key) DO UPDATE
    SET hits = CASE WHEN r.reset_at <= NOW() THEN 1 ELSE r.hits + 1 END,
        reset_at = CASE WHEN r.reset_at <= NOW() THEN NOW() + v_window ELSE r.reset_at END
    RETURNING r.hits, r.reset_at INTO v_hits, v_reset;

    IF v_hits > p_limit THEN
        RETURN QUERY SELECT FALSE, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset - NOW())))::INTEGER);
    ELSE
        RETURN QUERY SELECT TRUE, 0;
    END IF;
END;
$$;

-- Only the server (service role) may call these.
REVOKE ALL ON FUNCTION public.auth_consume_nonce (TEXT, TIMESTAMPTZ)
FROM
    PUBLIC,
    anon,
    authenticated;

REVOKE ALL ON FUNCTION public.auth_rate_limit (TEXT, INTEGER, INTEGER)
FROM
    PUBLIC,
    anon,
    authenticated;

GRANT
EXECUTE ON FUNCTION public.auth_consume_nonce (TEXT, TIMESTAMPTZ) TO service_role;

GRANT
EXECUTE ON FUNCTION public.auth_rate_limit (TEXT, INTEGER, INTEGER) TO service_role;

-- ============================================================================
-- 6. VERIFICATION QUERIES (Optional - Run to verify setup)
-- ============================================================================

-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE
    table_schema = 'public'
    AND table_name IN (
        'users',
        'agreements',
        'milestones',
        'auth_nonces',
        'auth_rate_limits'
    );

-- Check indexes exist
SELECT indexname
FROM pg_indexes
WHERE
    tablename IN ('users', 'agreements', 'milestones');

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE
    tablename IN ('users', 'agreements', 'milestones');

-- Check policies exist
SELECT tablename, policyname
FROM pg_policies
WHERE
    tablename IN ('users', 'agreements', 'milestones');
