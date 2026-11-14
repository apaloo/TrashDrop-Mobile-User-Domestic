-- Function public.get_location_price
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_location_price(p_latitude numeric, p_longitude numeric, p_bin_size integer): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_location_price(p_latitude numeric, p_longitude numeric, p_bin_size integer)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_price DECIMAL;
  v_zone RECORD;
BEGIN
  -- Find nearest zone within 10km
  SELECT * INTO v_zone
  FROM public.find_nearest_pricing_zone(p_latitude, p_longitude, 10)
  LIMIT 1;
  
  -- If no zone found, return NULL (caller will use fallback)
  IF v_zone IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Return price based on bin size
  CASE p_bin_size
    WHEN 50 THEN v_price := v_zone.price_50l;
    WHEN 60 THEN v_price := v_zone.price_60l;
    WHEN 80 THEN v_price := v_zone.price_80l;
    WHEN 90 THEN v_price := v_zone.price_90l;
    WHEN 100 THEN v_price := v_zone.price_100l;
    WHEN 120 THEN v_price := v_zone.price_120l;
    WHEN 240 THEN v_price := v_zone.price_240l;
    WHEN 260 THEN v_price := v_zone.price_260l;
    WHEN 320 THEN v_price := v_zone.price_320l;
    WHEN 360 THEN v_price := v_zone.price_360l;
    ELSE v_price := NULL;
  END CASE;
  
  RETURN v_price;
END;
$function$;
