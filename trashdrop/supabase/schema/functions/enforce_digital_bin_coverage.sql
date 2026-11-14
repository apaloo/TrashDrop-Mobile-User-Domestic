-- Function public.enforce_digital_bin_coverage
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- enforce_digital_bin_coverage(): execute: service_role
CREATE OR REPLACE FUNCTION public.enforce_digital_bin_coverage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_latitude DOUBLE PRECISION;
  v_longitude DOUBLE PRECISION;
  v_is_covered BOOLEAN;
BEGIN
  IF current_setting('trashdrop.skip_coverage_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT ST_Y(bl.coordinates::geometry), ST_X(bl.coordinates::geometry)
  INTO v_latitude, v_longitude
  FROM public.bin_locations bl
  WHERE bl.id = NEW.location_id;

  IF v_latitude IS NOT NULL AND v_longitude IS NOT NULL THEN
    SELECT c.is_covered INTO v_is_covered
    FROM public.check_service_coverage(v_latitude, v_longitude) c;
  END IF;

  IF COALESCE(v_is_covered, false) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'This location is outside the TrashDrop service area'
    USING ERRCODE = 'TDC01',
          DETAIL = format('location_id=%s latitude=%s longitude=%s', NEW.location_id, v_latitude, v_longitude),
          HINT = 'Pick a location inside an active pricing zone''s service radius.';
END;
$function$;
