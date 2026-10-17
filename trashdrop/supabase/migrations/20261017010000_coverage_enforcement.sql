-- Coverage enforcement (Phase 2 of service coverage).
--
-- 20261017000000_service_coverage.sql added check_service_coverage and the
-- app/WhatsApp location steps now refuse uncovered pins. That check runs on
-- the customer's device or in our functions, so an old app build or a direct
-- API call could still create a bin nobody can collect. This migration makes
-- the database the authority:
--
--   1. get_covering_pricing_zone: prices come only from the zone that covers
--      the pin (same radius rule as check_service_coverage). Pins outside every
--      zone get no zone, and callers no longer fall back to default prices.
--   2. A trigger on digital_bins rejects any bin whose location is not covered,
--      with SQLSTATE TDC01 so clients can tell this apart from other failures.
--
-- Existing bins are untouched: the trigger fires on INSERT and on a change of
-- location_id only.
--
-- Ops escape hatch, for a deliberate one-off insert outside coverage:
--   BEGIN;
--   SET LOCAL trashdrop.skip_coverage_check = 'on';
--   INSERT INTO public.digital_bins ...;
--   COMMIT;

-- 1. Pricing from the covering zone only ---------------------------------------

CREATE OR REPLACE FUNCTION public.get_covering_pricing_zone(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS SETOF public.pricing_zones
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pz.*
  FROM public.check_service_coverage(p_latitude, p_longitude) c
  JOIN public.pricing_zones pz ON pz.id = c.zone_id
  WHERE c.is_covered;
$$;

REVOKE ALL ON FUNCTION public.get_covering_pricing_zone(DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_covering_pricing_zone(DOUBLE PRECISION, DOUBLE PRECISION)
  TO authenticated, service_role;

-- 2. Reject bins outside coverage ----------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_digital_bin_coverage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latitude DOUBLE PRECISION;
  v_longitude DOUBLE PRECISION;
  v_is_covered BOOLEAN;
BEGIN
  IF current_setting('trashdrop.skip_coverage_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Both the app and create_whatsapp_digital_bin write the bin_locations row
  -- (with its PostGIS point) before the bin that references it
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
$$;

REVOKE ALL ON FUNCTION public.enforce_digital_bin_coverage() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS digital_bins_enforce_coverage ON public.digital_bins;
CREATE TRIGGER digital_bins_enforce_coverage
  BEFORE INSERT OR UPDATE OF location_id ON public.digital_bins
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_digital_bin_coverage();

-- Close the gap left by 20261017000000: Supabase grants new functions to anon
-- directly, so revoking from PUBLIC alone left check_service_coverage callable
-- by signed-out visitors
REVOKE EXECUTE ON FUNCTION public.check_service_coverage(DOUBLE PRECISION, DOUBLE PRECISION) FROM anon;

NOTIFY pgrst, 'reload schema';
