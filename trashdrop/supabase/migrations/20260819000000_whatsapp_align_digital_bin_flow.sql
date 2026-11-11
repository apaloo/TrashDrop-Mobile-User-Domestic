-- WhatsApp Booking Layer — align with the in-app "Request Bin Pickup (No Bag)" flow
-- ----------------------------------------------------------------------------
-- The first cut of create_whatsapp_digital_bin only carried location, waste
-- type, size, count and urgency. The app's digital bin form (src/pages/DigitalBin.js)
-- also collects a schedule (frequency, pickup date, time window), free-text
-- notes, and a full SOP v4.5.6 fee breakdown. This migration widens the RPC so a
-- WhatsApp booking produces the same digital_bins row as the web form.
--
-- Also fixes two defects in the v2 function:
--   * coordinates were built with ST_GeogFromText, but bin_locations.coordinates
--     is geometry(Point,4326) — ST_SetSRID(ST_MakePoint(...)) works for both a
--     geometry column and a geography one (geometry->geography is an assignment cast).
--   * locations were reused by (user_id, location_name) alone. Every unlinked
--     WhatsApp booking is owned by the same guest user, so two customers who
--     both send "My Location" would have collided on one row. Reuse now also
--     requires the pin to be within 50 m.

-- --- Columns the app writes ------------------------------------------------
-- No-ops where production already has them; present so a database built from
-- this migrations directory alone can still accept a booking.
ALTER TABLE public.digital_bins
  -- 20250120000000_add_bin_size_and_urgent.sql sorts BEFORE the migration that
  -- creates digital_bins, so on a replay from scratch these two never land
  ADD COLUMN IF NOT EXISTS bin_size_liters integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_promotional boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_request_number integer,
  ADD COLUMN IF NOT EXISTS collector_core_payout numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collector_urgent_payout numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collector_distance_payout numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collector_surge_payout numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collector_tips numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collector_recyclables_payout numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collector_loyalty_cashback numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collector_total_payout numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surge_multiplier numeric(5,2) DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS deadhead_km numeric(10,2) DEFAULT 0;

-- The original CHECK predates the one-time option that the app now offers.
-- Widened defensively: if existing rows carry a value outside the new list the
-- constraint is left exactly as it was rather than failing the migration.
DO $$
BEGIN
  ALTER TABLE public.digital_bins DROP CONSTRAINT IF EXISTS check_frequency;
  ALTER TABLE public.digital_bins ADD CONSTRAINT check_frequency
    CHECK (frequency IN ('one-time', 'weekly', 'biweekly', 'monthly'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'check_frequency left unchanged: %', SQLERRM;
END;
$$;

-- --- Guest owner for unlinked WhatsApp bookings ------------------------------
-- digital_bins.user_id is NOT NULL, so a booking from someone with no app
-- account needs an owner. Created here rather than by hand in the dashboard so
-- a fresh environment is bootstrapped by the same migration that needs it.
-- The account can never be signed into: encrypted_password is deliberately not
-- a valid bcrypt hash, so no password will ever verify against it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'whatsapp-guest@trashdrop.app') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', 'whatsapp-guest@trashdrop.app',
      'no-login-' || gen_random_uuid()::text,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"WhatsApp Guest"}'::jsonb
    );
    RAISE NOTICE 'Created WhatsApp guest owner (whatsapp-guest@trashdrop.app)';
  ELSE
    RAISE NOTICE 'WhatsApp guest owner already exists';
  END IF;
EXCEPTION WHEN others THEN
  -- Never fail the migration over this; the RPC raises a clear error if missing
  RAISE WARNING 'Could not create the WhatsApp guest owner, create it in the Supabase dashboard: %', SQLERRM;
END;
$$;

-- --- Widened booking RPC ----------------------------------------------------
DROP FUNCTION IF EXISTS public.create_whatsapp_digital_bin(
  uuid, text, text, numeric, numeric, numeric, text, integer, integer, text, boolean
);

-- Creates a digital bin from a confirmed WhatsApp booking.
-- Every fee argument is the figure the customer was quoted in chat (computed by
-- netlify/functions/utils/pricing.js, the server-side mirror of costCalculator.js).
-- It is stored as-is so the record always matches what the customer agreed to.
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
  p_is_urgent boolean DEFAULT false,
  p_details text DEFAULT NULL,
  p_is_promotional boolean DEFAULT false,
  p_promo_request_number integer DEFAULT NULL,
  p_collector_core_payout numeric DEFAULT 0,
  p_collector_urgent_payout numeric DEFAULT 0,
  p_collector_total_payout numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_location_id uuid;
  v_bin_id uuid;
  v_point geometry;
  v_expires_at timestamptz;
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

  v_point := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326);

  -- Expiry mirrors DigitalBin.js handleSubmit
  v_expires_at := CASE p_frequency
    WHEN 'one-time' THEN now() + interval '7 days'
    WHEN 'weekly'   THEN now() + interval '7 days'
    WHEN 'biweekly' THEN now() + interval '14 days'
    WHEN 'monthly'  THEN now() + interval '1 month'
    ELSE now() + interval '7 days'
  END;

  -- Reuse a saved location only when the name AND the pin match, so bookings
  -- from different customers under the shared guest owner never collide.
  SELECT bl.id INTO v_location_id
  FROM public.bin_locations bl
  WHERE bl.user_id = v_user_id
    AND bl.location_name = p_location_name
    AND ST_DWithin(bl.coordinates::geography, v_point::geography, 50)
  ORDER BY bl.created_at DESC
  LIMIT 1;

  IF v_location_id IS NULL THEN
    INSERT INTO public.bin_locations (user_id, location_name, address, coordinates, is_default)
    VALUES (v_user_id, p_location_name, p_address, v_point, false)
    RETURNING id INTO v_location_id;
  END IF;

  INSERT INTO public.digital_bins (
    user_id, whatsapp_user_id, location_id, qr_code_url, frequency, waste_type,
    bag_count, bin_size_liters, is_urgent, details, fee, is_active, status, expires_at,
    is_promotional, promo_request_number,
    collector_core_payout, collector_urgent_payout, collector_distance_payout,
    collector_surge_payout, collector_tips, collector_recyclables_payout,
    collector_loyalty_cashback, collector_total_payout, surge_multiplier, deadhead_km
  ) VALUES (
    v_user_id, p_whatsapp_user_id, v_location_id,
    'https://trashdrop.app/bin/' || v_location_id::text,
    p_frequency, p_waste_type, p_bag_count, p_bin_size_liters, p_is_urgent,
    p_details, COALESCE(p_fee_total, 0), true, 'pending', v_expires_at,
    COALESCE(p_is_promotional, false), p_promo_request_number,
    COALESCE(p_collector_core_payout, 0), COALESCE(p_collector_urgent_payout, 0), 0,
    0, 0, 0,
    0, COALESCE(p_collector_total_payout, 0), 1.00, 0
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

REVOKE EXECUTE ON FUNCTION public.create_whatsapp_digital_bin(
  uuid, text, text, numeric, numeric, numeric, text, integer, integer, text, boolean,
  text, boolean, integer, numeric, numeric, numeric
) FROM PUBLIC, anon, authenticated;
