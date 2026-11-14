-- Function public.create_whatsapp_digital_bin
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- create_whatsapp_digital_bin(p_whatsapp_user_id uuid, p_location_name text, p_address text, p_latitude numeric, p_longitude numeric, p_fee_total numeric, p_waste_type text, p_bin_size_liters integer, p_bag_count integer, p_frequency text, p_is_urgent boolean, p_details text, p_is_promotional boolean, p_promo_request_number integer, p_collector_core_payout numeric, p_collector_urgent_payout numeric, p_collector_total_payout numeric): execute: service_role
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
