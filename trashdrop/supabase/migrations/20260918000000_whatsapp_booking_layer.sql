-- WhatsApp booking layer: tables and RPCs
--
-- These objects were created by hand in the Supabase dashboard and existed in no
-- migration, so nothing in the repo recorded the contract the Netlify functions
-- depend on. This file reconstructs them from their call sites:
--
--   netlify/functions/whatsapp-webhook.js
--     record_whatsapp_message(p_message_id, p_phone)      -> boolean
--     get_active_whatsapp_session(p_phone)                -> setof session row
--     update_whatsapp_session(p_session_id, p_state, p_collected_data)
--   netlify/functions/utils/conversation-engine.js
--     create_whatsapp_digital_bin(...)                    -> uuid
--     digital_bins.photo_urls
--   netlify/functions/whatsapp-notify.js
--     whatsapp_users.phone, digital_bins.whatsapp_user_id
--
-- Applied to project tfdedlqdsajjdjkerkli on 2026-09-18. Already present there:
-- whatsapp_users, whatsapp_sessions, digital_bins.photo_urls, and the three
-- section 2 functions. Created by this file: whatsapp_messages,
-- record_whatsapp_message, cleanup_whatsapp_messages,
-- get_whatsapp_guest_user_id, and digital_bins.whatsapp_user_id.
--
-- Three independent breaks, each fatal on its own, each silent:
--
--   1. record_whatsapp_message did not exist, so the webhook's very first RPC
--      errored, it logged "Dedupe check failed" and returned 200 — every inbound
--      message discarded before the conversation engine ever ran.
--   2. digital_bins.whatsapp_user_id did not exist, but
--      create_whatsapp_digital_bin lists it in its INSERT — so any booking that
--      did get that far failed on an unknown column.
--   3. get_whatsapp_guest_user_id did not exist, though
--      create_whatsapp_digital_bin calls it for the guest-owner fallback.
--
-- whatsapp_users held 0 rows when this was applied, consistent with no customer
-- message ever having reached the database.
--
-- WHY SECTION 2 IS GUARDED RATHER THAN "CREATE OR REPLACE":
--
-- The live create_whatsapp_digital_bin declares p_latitude/p_longitude as
-- `numeric`. PostgreSQL identifies a function by its argument TYPES, so a
-- CREATE OR REPLACE of the same name with `double precision` does not replace
-- it — it adds a second overload, and every named-argument call from PostgREST
-- then fails with "function is not unique". The same class of problem applies to
-- a changed TABLE(...) return type, which CREATE OR REPLACE rejects outright.
--
-- These functions also predate this file, so their live bodies are authoritative
-- and are not reproduced here from guesswork. Section 2 therefore creates each
-- object only when it is absent, which makes this file correct on a fresh
-- project and a no-op on one that already has them.

-- ===========================================================================
-- Section 1 — required by the webhook, and previously missing
-- ===========================================================================

-- One row per customer phone number. user_id links the number to an app account
-- when the customer has one; it stays NULL for WhatsApp-only customers, whose
-- bookings are owned by the whatsapp-guest@trashdrop.app auth user instead.
CREATE TABLE IF NOT EXISTS public.whatsapp_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        TEXT NOT NULL UNIQUE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_users_user_id ON public.whatsapp_users(user_id);

-- The conversation state machine. `state` mirrors STATES in
-- utils/conversation-engine.js and `collected_data` accumulates the booking
-- fields across turns. Deliberately untyped text rather than an enum: the engine
-- adds states (AWAITING_FLOW was one) more often than the database should need
-- a migration.
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_user_id UUID NOT NULL REFERENCES public.whatsapp_users(id) ON DELETE CASCADE,
  state            TEXT NOT NULL DEFAULT 'idle',
  collected_data   JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user_expiry
  ON public.whatsapp_sessions(whatsapp_user_id, expires_at DESC);

ALTER TABLE public.whatsapp_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Idempotency ledger. Meta redelivers a webhook until it gets a 200, and a
-- redelivery that re-ran the engine would re-send prompts or double-book, so
-- every message id is claimed exactly once before any work happens.
--
-- Without this table and its function, supabase.rpc('record_whatsapp_message')
-- errors, the webhook logs "Dedupe check failed" and returns 200 — so every
-- inbound message is silently discarded before the engine ever runs.
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  message_id  TEXT PRIMARY KEY,
  phone       TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_received_at
  ON public.whatsapp_messages(received_at);

-- RLS on with no permissive policies: only the Netlify functions touch this, and
-- they use the service_role key, which bypasses RLS. anon gets nothing.
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- TRUE means "not seen before, go ahead and process"; FALSE means this is a
-- redelivery and the caller must stop. The webhook tests `isNew === false`
-- exactly, so the polarity here is load-bearing.
CREATE OR REPLACE FUNCTION public.record_whatsapp_message(
  p_message_id TEXT,
  p_phone      TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  INSERT INTO public.whatsapp_messages (message_id, phone)
  VALUES (p_message_id, p_phone)
  ON CONFLICT (message_id) DO NOTHING;

  -- FOUND is false when ON CONFLICT swallowed the insert, i.e. a redelivery
  RETURN FOUND;
END;
$fn$;

-- Owner for bookings from WhatsApp customers with no linked app account.
--
-- create_whatsapp_digital_bin calls this, but it had never been created, so
-- every booking that got as far as the guest fallback died with
-- "42883: function public.get_whatsapp_guest_user_id() does not exist".
--
-- Returns NULL when the guest account is absent rather than raising: the caller
-- checks for NULL and raises its own message naming the account to create.
CREATE OR REPLACE FUNCTION public.get_whatsapp_guest_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT u.id FROM auth.users u
  WHERE u.email = 'whatsapp-guest@trashdrop.app'
  LIMIT 1;
$fn$;

-- Trim the ledger. Meta stops redelivering long before this, so a week is
-- generous; without it the table grows without bound.
CREATE OR REPLACE FUNCTION public.cleanup_whatsapp_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.whatsapp_messages
    WHERE received_at < NOW() - INTERVAL '7 days'
    RETURNING message_id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$fn$;

-- Identifies the customer on a booking taken over WhatsApp. whatsapp-notify.js
-- prefers this over user_id, which points at the shared guest auth user for
-- WhatsApp-only customers and so cannot identify anyone.
--
-- create_whatsapp_digital_bin already lists this column in its INSERT and passes
-- p_whatsapp_user_id for it. The column simply did not exist, so that INSERT
-- failed — which means no WhatsApp booking had ever been committed. Adding the
-- column is the whole fix; the function needs no change.
ALTER TABLE public.digital_bins
  ADD COLUMN IF NOT EXISTS whatsapp_user_id UUID
  REFERENCES public.whatsapp_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_digital_bins_whatsapp_user_id
  ON public.digital_bins(whatsapp_user_id)
  WHERE whatsapp_user_id IS NOT NULL;

-- Written by attachBinPhotos() after the booking is committed, matching the
-- app's own insert-then-attach order. Already present as an array on
-- tfdedlqdsajjdjkerkli; this is for fresh projects.
ALTER TABLE public.digital_bins
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[];

REVOKE ALL ON FUNCTION public.record_whatsapp_message(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_whatsapp_messages() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_whatsapp_guest_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_whatsapp_message(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_whatsapp_messages() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_guest_user_id() TO service_role;

COMMENT ON TABLE public.whatsapp_messages IS
  'Idempotency ledger of processed Meta message ids. Meta redelivers until it receives a 200, so each id is claimed once before any work happens.';
COMMENT ON COLUMN public.digital_bins.whatsapp_user_id IS
  'Set when the booking came in over WhatsApp. Populating it requires create_whatsapp_digital_bin to be updated; until then it stays NULL.';

-- ===========================================================================
-- Section 2 — fresh-install only (already present on tfdedlqdsajjdjkerkli)
-- ===========================================================================

DO $guard$
BEGIN

-- Get the caller's live session, creating the customer and/or the session when
-- this is their first message or their last one expired. The webhook reads
-- sessionRows[0].{session_id, whatsapp_user_id, state, collected_data}, so these
-- column names are part of the contract.
IF NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_active_whatsapp_session'
) THEN
  EXECUTE $body$
    CREATE FUNCTION public.get_active_whatsapp_session(p_phone TEXT)
    RETURNS TABLE (
      session_id       UUID,
      whatsapp_user_id UUID,
      state            TEXT,
      collected_data   JSONB
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
    DECLARE
      v_user_id    UUID;
      v_session_id UUID;
    BEGIN
      -- DO UPDATE rather than DO NOTHING so RETURNING yields a row on conflict too
      INSERT INTO public.whatsapp_users (phone)
      VALUES (p_phone)
      ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
      RETURNING id INTO v_user_id;

      SELECT s.id INTO v_session_id
      FROM public.whatsapp_sessions s
      WHERE s.whatsapp_user_id = v_user_id AND s.expires_at > NOW()
      ORDER BY s.expires_at DESC
      LIMIT 1;

      IF v_session_id IS NULL THEN
        INSERT INTO public.whatsapp_sessions (whatsapp_user_id)
        VALUES (v_user_id)
        RETURNING id INTO v_session_id;
      END IF;

      RETURN QUERY
      SELECT s.id, s.whatsapp_user_id, s.state, s.collected_data
      FROM public.whatsapp_sessions s
      WHERE s.id = v_session_id;
    END;
    $fn$;
  $body$;
END IF;

-- The webhook calls this on every turn, even when the state did not change,
-- specifically so expires_at is pushed out — a customer re-prompted in the same
-- step must not time out mid-booking.
IF NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_whatsapp_session'
) THEN
  EXECUTE $body$
    CREATE FUNCTION public.update_whatsapp_session(
      p_session_id     UUID,
      p_state          TEXT,
      p_collected_data JSONB
    )
    RETURNS VOID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
    BEGIN
      UPDATE public.whatsapp_sessions
      SET state          = p_state,
          collected_data = COALESCE(p_collected_data, '{}'::jsonb),
          expires_at     = NOW() + INTERVAL '24 hours',
          updated_at     = NOW()
      WHERE id = p_session_id;
    END;
    $fn$;
  $body$;
END IF;

-- Commit a booking taken over WhatsApp: create the bin_locations row from the
-- shared pin, then the digital_bins row referencing it, in one transaction so a
-- failure cannot leave an orphan location. The bin id is generated up front
-- because qr_code_url encodes it and the engine reads that column back to render
-- the QR it sends in the chat.
--
-- p_latitude/p_longitude are numeric to match the live signature on
-- tfdedlqdsajjdjkerkli. Do not "modernise" these to double precision.
--
-- This is a behavioural equivalent of the live function, not a byte-for-byte
-- copy: the live one also reuses a saved bin_location when the name AND pin both
-- match, so bookings from different customers under the shared guest owner never
-- collide. On a project that already has the function this branch never runs, so
-- the live definition stays authoritative.
IF NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_whatsapp_digital_bin'
) THEN
  EXECUTE $body$
    CREATE FUNCTION public.create_whatsapp_digital_bin(
      p_whatsapp_user_id        UUID,
      p_location_name           TEXT,
      p_address                 TEXT,
      p_latitude                NUMERIC,
      p_longitude               NUMERIC,
      p_fee_total               NUMERIC,
      p_waste_type              TEXT,
      p_bin_size_liters         INTEGER,
      p_bag_count               INTEGER,
      p_frequency               TEXT,
      p_is_urgent               BOOLEAN,
      p_details                 TEXT,
      p_is_promotional          BOOLEAN DEFAULT FALSE,
      p_promo_request_number    INTEGER DEFAULT NULL,
      p_collector_core_payout   NUMERIC DEFAULT 0,
      p_collector_urgent_payout NUMERIC DEFAULT 0,
      p_collector_total_payout  NUMERIC DEFAULT 0
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
    DECLARE
      v_owner_id    UUID;
      v_location_id UUID;
      v_bin_id      UUID := gen_random_uuid();
    BEGIN
      SELECT wu.user_id INTO v_owner_id
      FROM public.whatsapp_users wu WHERE wu.id = p_whatsapp_user_id;

      IF v_owner_id IS NULL THEN
        v_owner_id := public.get_whatsapp_guest_user_id();

        -- A named failure, because a bare foreign-key violation here sends you
        -- looking at the wrong thing entirely
        IF v_owner_id IS NULL THEN
          RAISE EXCEPTION
            'WhatsApp guest user is missing. Create an auth user with email '
            'whatsapp-guest@trashdrop.app (auto-confirm ON) before taking '
            'bookings from customers with no linked app account.';
        END IF;
      END IF;

      -- POINT(lng lat) — the same argument order DigitalBin.js writes
      INSERT INTO public.bin_locations (user_id, location_name, address, coordinates, is_default)
      VALUES (
        v_owner_id,
        COALESCE(NULLIF(p_location_name, ''), 'WhatsApp Location'),
        COALESCE(p_address, ''),
        ST_SetSRID(ST_MakePoint(p_longitude::double precision, p_latitude::double precision), 4326),
        FALSE
      )
      RETURNING id INTO v_location_id;

      INSERT INTO public.digital_bins (
        id, user_id, whatsapp_user_id, location_id, qr_code_url,
        frequency, waste_type, bag_count, bin_size_liters, is_urgent,
        details, is_active, status, fee, expires_at,
        is_promotional, promo_request_number,
        collector_core_payout, collector_urgent_payout, collector_total_payout
      )
      VALUES (
        v_bin_id, v_owner_id, p_whatsapp_user_id, v_location_id,
        'https://trashdrop.app/bin/' || v_bin_id::text,
        COALESCE(p_frequency, 'one-time'),
        COALESCE(p_waste_type, 'general'),
        COALESCE(p_bag_count, 1),
        COALESCE(p_bin_size_liters, 120),
        COALESCE(p_is_urgent, FALSE),
        p_details,
        TRUE,
        'pending',
        ROUND(COALESCE(p_fee_total, 0), 2),
        -- Expiry follows the collection frequency, as the live function does
        NOW() + CASE COALESCE(p_frequency, 'one-time')
                  WHEN 'weekly'   THEN INTERVAL '7 days'
                  WHEN 'biweekly' THEN INTERVAL '14 days'
                  WHEN 'monthly'  THEN INTERVAL '1 month'
                  ELSE                 INTERVAL '7 days'
                END,
        COALESCE(p_is_promotional, FALSE),
        p_promo_request_number,
        ROUND(COALESCE(p_collector_core_payout, 0), 2),
        ROUND(COALESCE(p_collector_urgent_payout, 0), 2),
        ROUND(COALESCE(p_collector_total_payout, 0), 2)
      );

      RETURN v_bin_id;
    END;
    $fn$;
  $body$;
END IF;

END
$guard$;

COMMENT ON TABLE public.whatsapp_users IS
  'One row per customer WhatsApp number. user_id is NULL until the number is linked to an app account; unlinked customers'' bookings are owned by the whatsapp-guest@trashdrop.app auth user.';
COMMENT ON TABLE public.whatsapp_sessions IS
  'Conversation state for the WhatsApp booking engine. state mirrors STATES in netlify/functions/utils/conversation-engine.js.';
