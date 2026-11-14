-- Function public.td_set_digital_bin_price
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_set_digital_bin_price(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_set_digital_bin_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_latitude double precision;
  v_longitude double precision;
  p record;
BEGIN
  IF auth.uid() IS NULL AND current_setting('trashdrop.skip_bin_pricing', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT ST_Y(bl.coordinates::geometry), ST_X(bl.coordinates::geometry)
  INTO v_latitude, v_longitude
  FROM public.bin_locations bl
  WHERE bl.id = NEW.location_id;

  SELECT * INTO p
  FROM public.td_price_digital_bin(NEW.user_id, v_latitude, v_longitude,
                                   NEW.bin_size_liters, NEW.bag_count, NEW.is_urgent, true);

  NEW.fee := p.fee;
  NEW.is_promotional := p.is_promotional;
  NEW.promo_request_number := p.promo_request_number;
  NEW.collector_core_payout := p.collector_core_payout;
  NEW.collector_urgent_payout := p.collector_urgent_payout;
  NEW.collector_distance_payout := 0;
  NEW.collector_surge_payout := 0;
  NEW.collector_total_payout := p.collector_total_payout;
  NEW.surge_multiplier := 1.0;
  RETURN NEW;
END;
$function$;
