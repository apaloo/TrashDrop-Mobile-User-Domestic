-- Stop using trashdrop.app (TD58). The domain belongs to someone else
-- (confirmed by the owner, 2026-11-12), yet:
--   * every digital bin's QR link was https://trashdrop.app/bin/<id>, so a
--     phone camera scanning a bin's QR opened a stranger's site;
--   * the WhatsApp guest account (owner of WhatsApp bookings from customers
--     without an app account) was whatsapp-guest@trashdrop.app, so a password
--     reset for it would be emailed to that stranger.
-- The four functions below are the live definitions with only those strings
-- changed (checked: no other trashdrop.app reference). The collector app reads
-- the bin id from any .../bin/<id> link, so collections are unaffected and
-- codes already shared keep working for collectors.

CREATE OR REPLACE FUNCTION public.set_digital_bin_qr_code_url()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  NEW.qr_code_url := 'https://app.trashdrops.com/bin/' || NEW.id::text;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_digital_bin(user_uuid uuid, location_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  bin_id UUID;
  resolved_location_id UUID;
  user_location RECORD;
BEGIN
  PERFORM public.td_assert_self_or_staff(user_uuid);
  resolved_location_id := location_id;

  -- If no location_id provided, create one in bin_locations
  -- from the user's default location in "locations" table
  IF resolved_location_id IS NULL THEN
    -- Try to find user's default or most recent location
    SELECT id, location_name, address, latitude, longitude
    INTO user_location
    FROM locations
    WHERE user_id = user_uuid
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1;

    IF user_location IS NOT NULL THEN
      INSERT INTO bin_locations (
        user_id, location_name, address,
        coordinates, is_default
      )
      VALUES (
        user_uuid,
        user_location.location_name,
        user_location.address,
        ST_SetSRID(ST_MakePoint(
          COALESCE(user_location.longitude, 0),
          COALESCE(user_location.latitude, 0)
        ), 4326),
        true
      )
      RETURNING id INTO resolved_location_id;
    ELSE
      -- No location at all — create a placeholder bin_location
      INSERT INTO bin_locations (
        user_id, location_name, address,
        coordinates, is_default
      )
      VALUES (
        user_uuid,
        'Default',
        'Set during onboarding',
        ST_SetSRID(ST_MakePoint(0, 0), 4326),
        true
      )
      RETURNING id INTO resolved_location_id;
    END IF;
  END IF;

  -- Create the digital bin
  INSERT INTO digital_bins (
    user_id, location_id, qr_code_url, status, expires_at
  )
  VALUES (
    user_uuid,
    resolved_location_id,
    'https://app.trashdrops.com/bin/' || gen_random_uuid(),
    'pending',
    NOW() + INTERVAL '7 days'
  )
  RETURNING id INTO bin_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'digital_bin_requested', 'Digital bin created during onboarding');

  RETURN bin_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_whatsapp_guest_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT u.id FROM auth.users u
  WHERE u.email = 'whatsapp-guest@trashdrops.com'
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.create_whatsapp_digital_bin(p_whatsapp_user_id uuid, p_location_name text, p_address text, p_latitude numeric, p_longitude numeric, p_fee_total numeric, p_waste_type text DEFAULT 'general'::text, p_bin_size_liters integer DEFAULT 120, p_bag_count integer DEFAULT 1, p_frequency text DEFAULT 'one-time'::text, p_is_urgent boolean DEFAULT false, p_details text DEFAULT NULL::text, p_is_promotional boolean DEFAULT false, p_promo_request_number integer DEFAULT NULL::integer, p_collector_core_payout numeric DEFAULT 0, p_collector_urgent_payout numeric DEFAULT 0, p_collector_total_payout numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
    RAISE EXCEPTION 'WhatsApp guest user (whatsapp-guest@trashdrops.com) does not exist';
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
    'https://app.trashdrops.com/bin/' || v_location_id::text,
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
$function$;

-- Who may run the two WhatsApp functions is unchanged: the server only
-- (CREATE OR REPLACE keeps grants; stated here so it stays that way).
REVOKE ALL ON FUNCTION public.get_whatsapp_guest_user_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_guest_user_id() TO service_role;
REVOKE ALL ON FUNCTION public.create_whatsapp_digital_bin(uuid, text, text, numeric, numeric, numeric, text, integer, integer, text, boolean, text, boolean, integer, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_whatsapp_digital_bin(uuid, text, text, numeric, numeric, numeric, text, integer, integer, text, boolean, text, boolean, integer, numeric, numeric, numeric) TO service_role;

-- The WhatsApp guest account is never signed in to: the functions above use
-- its id. Move it to our own domain, remove its password and ban sign-in, so
-- no reset or magic link can turn it into a usable account.
UPDATE auth.users
   SET email = 'whatsapp-guest@trashdrops.com',
       encrypted_password = '',
       banned_until = 'infinity',
       updated_at = now()
 WHERE email = 'whatsapp-guest@trashdrop.app';

-- A leftover test account on trashdrop.com (no password, never confirmed,
-- never signed in, no data): ban sign-in, for the same reason.
UPDATE auth.users
   SET banned_until = 'infinity', updated_at = now()
 WHERE email ILIKE '%@trashdrop.com';

-- Existing bins: the stored link moves to our domain (only qr_code_url
-- changes; the price, payout and status guards let this through).
UPDATE public.digital_bins
   SET qr_code_url = replace(qr_code_url, 'https://trashdrop.app/bin/', 'https://app.trashdrops.com/bin/')
 WHERE qr_code_url LIKE 'https://trashdrop.app/bin/%';
