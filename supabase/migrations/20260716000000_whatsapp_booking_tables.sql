-- WhatsApp Booking Layer (v2)
-- Conversational waste-collection booking via Meta WhatsApp Cloud API.
-- All access is via SECURITY DEFINER RPCs called with the service role key;
-- tables have RLS enabled with NO policies (deny all except service role).
--
-- PREREQUISITE: create the guest auth user whatsapp-guest@trashdrop.app in
-- Supabase Dashboard -> Authentication -> Add user (auto-confirm ON). It owns
-- digital_bins created by WhatsApp users who have no app account, because
-- digital_bins.user_id and bin_locations.user_id are NOT NULL.

-- Phone normalization: strip non-digits; convert Ghana local 0XXXXXXXXX to 233XXXXXXXXX
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    WHEN regexp_replace(p_phone, '\D', '', 'g') ~ '^0\d{9}$'
      THEN '233' || substring(regexp_replace(p_phone, '\D', '', 'g') FROM 2)
    ELSE regexp_replace(p_phone, '\D', '', 'g')
  END
$$;

-- Bridge table: WhatsApp phone numbers <-> Supabase auth users
CREATE TABLE IF NOT EXISTS public.whatsapp_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,          -- normalized digits, e.g. 233244000000
  user_id uuid,                        -- NULL until linked to an app account
  display_name text,                   -- WhatsApp profile name
  language text DEFAULT 'en',          -- 'en' or 'tw' (Twi)
  is_active boolean DEFAULT true,
  total_bookings integer DEFAULT 0,
  last_booking_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT whatsapp_users_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_users_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Conversation state machine: tracks where each user is in the booking flow
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  whatsapp_user_id uuid NOT NULL,
  phone text NOT NULL,                 -- denormalized for fast lookup
  state text NOT NULL DEFAULT 'idle',  -- idle | awaiting_waste_type | awaiting_bin_count | awaiting_bin_size | awaiting_location | awaiting_confirmation | completed | cancelled
  collected_data jsonb DEFAULT '{}'::jsonb,
  last_message_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '30 minutes'),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT whatsapp_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_sessions_whatsapp_user_id_fkey FOREIGN KEY (whatsapp_user_id)
    REFERENCES public.whatsapp_users(id) ON DELETE CASCADE
);

-- Webhook idempotency: Meta redelivers messages; process each id exactly once
CREATE TABLE IF NOT EXISTS public.whatsapp_processed_messages (
  message_id text NOT NULL,
  phone text,
  received_at timestamp with time zone DEFAULT now(),
  CONSTRAINT whatsapp_processed_messages_pkey PRIMARY KEY (message_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone_active
  ON public.whatsapp_sessions(phone, state, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_users_phone
  ON public.whatsapp_users(phone);

CREATE INDEX IF NOT EXISTS idx_whatsapp_processed_messages_received
  ON public.whatsapp_processed_messages(received_at);

-- Trace WhatsApp bookings even when owned by the guest user
ALTER TABLE public.digital_bins
  ADD COLUMN IF NOT EXISTS whatsapp_user_id uuid
  REFERENCES public.whatsapp_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_digital_bins_whatsapp_user
  ON public.digital_bins(whatsapp_user_id)
  WHERE whatsapp_user_id IS NOT NULL;

-- Guest owner for unlinked WhatsApp bookings (see PREREQUISITE above)
CREATE OR REPLACE FUNCTION public.get_whatsapp_guest_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM auth.users WHERE email = 'whatsapp-guest@trashdrop.app' LIMIT 1
$$;

-- Idempotency check: returns true if this message id is new (and records it),
-- false if already processed. Opportunistically prunes rows older than 7 days.
CREATE OR REPLACE FUNCTION public.record_whatsapp_message(
  p_message_id text,
  p_phone text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.whatsapp_processed_messages
  WHERE received_at < now() - interval '7 days';

  INSERT INTO public.whatsapp_processed_messages (message_id, phone)
  VALUES (p_message_id, public.normalize_phone(p_phone));
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;

-- Find or create a whatsapp_user by phone number
CREATE OR REPLACE FUNCTION public.upsert_whatsapp_user(
  p_phone text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_phone text := public.normalize_phone(p_phone);
BEGIN
  SELECT id INTO v_id FROM public.whatsapp_users WHERE phone = v_phone;

  IF v_id IS NULL THEN
    INSERT INTO public.whatsapp_users (phone, display_name)
    VALUES (v_phone, p_display_name)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.whatsapp_users
    SET display_name = COALESCE(p_display_name, display_name),
        updated_at = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- Get or create the active session for a phone (reuses latest idle row
-- instead of accumulating one new row per booking cycle)
CREATE OR REPLACE FUNCTION public.get_active_whatsapp_session(
  p_phone text
)
RETURNS TABLE (
  session_id uuid,
  whatsapp_user_id uuid,
  state text,
  collected_data jsonb
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_phone text := public.normalize_phone(p_phone);
  v_wa_user_id uuid;
  v_session_id uuid;
  v_state text;
  v_data jsonb;
BEGIN
  SELECT id INTO v_wa_user_id FROM public.whatsapp_users WHERE phone = v_phone;

  IF v_wa_user_id IS NULL THEN
    INSERT INTO public.whatsapp_users (phone)
    VALUES (v_phone)
    RETURNING id INTO v_wa_user_id;
  END IF;

  -- Active (non-expired, non-idle) session first
  SELECT ws.id, ws.state, ws.collected_data
  INTO v_session_id, v_state, v_data
  FROM public.whatsapp_sessions ws
  WHERE ws.phone = v_phone
    AND ws.state != 'idle'
    AND ws.expires_at > now()
  ORDER BY ws.created_at DESC
  LIMIT 1;

  -- Otherwise reuse the most recent idle row
  IF v_session_id IS NULL THEN
    SELECT ws.id INTO v_session_id
    FROM public.whatsapp_sessions ws
    WHERE ws.phone = v_phone AND ws.state = 'idle'
    ORDER BY ws.created_at DESC
    LIMIT 1;

    IF v_session_id IS NOT NULL THEN
      UPDATE public.whatsapp_sessions
      SET collected_data = '{}'::jsonb,
          last_message_at = now(),
          expires_at = now() + interval '30 minutes',
          updated_at = now()
      WHERE id = v_session_id;
      v_state := 'idle';
      v_data := '{}'::jsonb;
    END IF;
  END IF;

  -- Truly new phone: create the row
  IF v_session_id IS NULL THEN
    INSERT INTO public.whatsapp_sessions (whatsapp_user_id, phone, state)
    VALUES (v_wa_user_id, v_phone, 'idle')
    RETURNING id, 'idle'::text, '{}'::jsonb INTO v_session_id, v_state, v_data;
  END IF;

  RETURN QUERY SELECT v_session_id, v_wa_user_id, v_state, v_data;
END;
$$;

-- Update session state and collected data (always refreshes expiry)
CREATE OR REPLACE FUNCTION public.update_whatsapp_session(
  p_session_id uuid,
  p_state text,
  p_collected_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.whatsapp_sessions
  SET state = p_state,
      collected_data = COALESCE(p_collected_data, collected_data),
      last_message_at = now(),
      expires_at = now() + interval '30 minutes',
      updated_at = now()
  WHERE id = p_session_id;
END;
$$;

-- Create a digital bin from a confirmed WhatsApp booking.
-- p_fee_total is the fee the user confirmed in chat (quote computed by the
-- conversation engine via find_nearest_pricing_zone) — stored as-is so the
-- record always matches what the customer was told.
CREATE OR REPLACE FUNCTION public.create_whatsapp_digital_bin(
  p_whatsapp_user_id uuid,
  p_location_name text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_fee_total numeric,
  p_waste_type text DEFAULT 'general',
  p_bin_size_liters integer DEFAULT 120,
  p_bag_count integer DEFAULT 1,
  p_frequency text DEFAULT 'one-time',
  p_is_urgent boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_location_id uuid;
  v_bin_id uuid;
BEGIN
  -- Linked app account, else the designated guest owner
  SELECT user_id INTO v_user_id
  FROM public.whatsapp_users WHERE id = p_whatsapp_user_id;

  IF v_user_id IS NULL THEN
    v_user_id := public.get_whatsapp_guest_user_id();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'WhatsApp guest user (whatsapp-guest@trashdrop.app) does not exist';
  END IF;

  SELECT id INTO v_location_id
  FROM public.bin_locations
  WHERE user_id = v_user_id AND location_name = p_location_name
  LIMIT 1;

  IF v_location_id IS NULL THEN
    INSERT INTO public.bin_locations (user_id, location_name, address, coordinates)
    VALUES (
      v_user_id,
      p_location_name,
      p_address,
      ST_GeogFromText('POINT(' || p_longitude || ' ' || p_latitude || ')')
    )
    RETURNING id INTO v_location_id;
  END IF;

  INSERT INTO public.digital_bins (
    user_id, whatsapp_user_id, location_id, qr_code_url, frequency, waste_type,
    bag_count, bin_size_liters, is_urgent, fee, status, expires_at
  ) VALUES (
    v_user_id, p_whatsapp_user_id, v_location_id,
    'whatsapp-bin-' || gen_random_uuid()::text,
    p_frequency, p_waste_type, p_bag_count, p_bin_size_liters, p_is_urgent,
    COALESCE(p_fee_total, 0), 'pending', now() + interval '7 days'
  )
  RETURNING id INTO v_bin_id;

  UPDATE public.whatsapp_users
  SET total_bookings = total_bookings + 1,
      last_booking_at = now(),
      updated_at = now()
  WHERE id = p_whatsapp_user_id;

  RETURN v_bin_id;
END;
$$;

-- Auto-link WhatsApp user when a profile is created/updated with matching phone
CREATE OR REPLACE FUNCTION public.link_whatsapp_user_on_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND NEW.phone != '' THEN
    UPDATE public.whatsapp_users
    SET user_id = NEW.id, updated_at = now()
    WHERE phone = public.normalize_phone(NEW.phone)
      AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_whatsapp_on_profile ON public.profiles;
CREATE TRIGGER trg_link_whatsapp_on_profile
  AFTER INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.link_whatsapp_user_on_profile_update();

-- Lock down: RLS on with NO policies -> only the service role can touch
-- these tables. (Deliberately no USING(true) policies: those would grant
-- the public anon key full read/write of customer phone numbers.)
ALTER TABLE public.whatsapp_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER functions default to PUBLIC execute; restrict to service role.
REVOKE EXECUTE ON FUNCTION public.upsert_whatsapp_user(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_active_whatsapp_session(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_whatsapp_session(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_whatsapp_digital_bin(uuid, text, text, numeric, numeric, numeric, text, integer, integer, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_whatsapp_message(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_guest_user_id() FROM PUBLIC, anon, authenticated;
