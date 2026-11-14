-- Function public.td_price_digital_bin
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_price_digital_bin(p_user_id uuid, p_latitude double precision, p_longitude double precision, p_bin_size_liters integer, p_bag_count integer, p_is_urgent boolean, p_claim boolean): execute: service_role
CREATE OR REPLACE FUNCTION public.td_price_digital_bin(p_user_id uuid, p_latitude double precision, p_longitude double precision, p_bin_size_liters integer, p_bag_count integer, p_is_urgent boolean, p_claim boolean DEFAULT false)
 RETURNS TABLE(fee numeric, collector_core_payout numeric, collector_urgent_payout numeric, collector_total_payout numeric, is_promotional boolean, promo_request_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bags integer := greatest(1, coalesce(p_bag_count, 1));
  v_size integer := coalesce(p_bin_size_liters, 120);
  v_client_fee numeric;
  v_collector_payout numeric;
  v_used integer;
  v_zone_price numeric;
  v_base numeric;
  v_urgent numeric;
BEGIN
  -- Promotions: not for urgent bookings
  IF p_user_id IS NOT NULL AND NOT coalesce(p_is_urgent, false) THEN
    SELECT s.client_fee, s.collector_payout INTO v_client_fee, v_collector_payout
    FROM public.promotional_fee_schedule s
    WHERE s.bin_size_liters = v_size AND s.is_active
    ORDER BY s.client_fee
    LIMIT 1;

    IF v_client_fee IS NOT NULL THEN
      IF p_claim THEN
        UPDATE public.promotional_usage u
        SET used_count = u.used_count + 1, updated_at = now()
        WHERE u.user_id = p_user_id AND u.used_count < u.max_requests
        RETURNING u.used_count INTO v_used;
      ELSE
        SELECT u.used_count + 1 INTO v_used
        FROM public.promotional_usage u
        WHERE u.user_id = p_user_id AND u.used_count < u.max_requests;
      END IF;

      IF v_used IS NOT NULL THEN
        RETURN QUERY SELECT
          round(v_client_fee * v_bags, 2),
          round(coalesce(v_collector_payout, v_client_fee) * v_bags, 2),
          0::numeric,
          round(coalesce(v_collector_payout, v_client_fee) * v_bags, 2),
          true,
          v_used;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Standard pricing: the zone covering the location, no default price
  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    SELECT nullif((to_jsonb(z) ->> ('price_' || v_size || 'l')), '')::numeric INTO v_zone_price
    FROM public.get_covering_pricing_zone(p_latitude, p_longitude) z
    LIMIT 1;
  END IF;

  IF v_zone_price IS NULL OR v_zone_price <= 0 THEN
    RAISE EXCEPTION 'We can''t price a % L bin at this location', v_size
      USING ERRCODE = 'TDC02',
            DETAIL = format('latitude=%s longitude=%s bin_size_liters=%s', p_latitude, p_longitude, v_size);
  END IF;

  v_base := v_zone_price * v_bags;
  v_urgent := CASE WHEN coalesce(p_is_urgent, false) THEN v_base * 0.30 ELSE 0 END;

  RETURN QUERY SELECT
    round(v_base + v_urgent + 1.00, 2),
    round(v_base, 2),
    round(v_urgent, 2),
    round(v_base + v_urgent, 2),
    false,
    NULL::integer;
END;
$function$;
