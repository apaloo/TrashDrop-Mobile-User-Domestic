-- Collector location writes work again.
--
-- The household app follows a collector live by watching their
-- collector_profiles row (current_latitude, current_longitude,
-- current_location, location_updated_at) through Realtime. Since
-- 2026-11-10 18:09 UTC no write to those columns has succeeded:
--
-- 1. update_collector_location() assigned p_latitude::text and
--    p_longitude::text to current_latitude / current_longitude, which are
--    numeric (42804: "column is of type numeric but expression is of type
--    text"). Every call from the collector app failed with HTTP 400.
-- 2. The collector app then falls back to updating the row directly, and
--    the BEFORE UPDATE trigger sync_collector_location_from_postgis()
--    compared NEW.current_location != OLD.current_location. PostGIS has no
--    <> operator for geometry (42725: "operator is not unique: geometry <>
--    geometry"), so the fallback failed too.
--
-- Fix: assign the numbers as numbers and store a geometry point; compare
-- geometries by their binary form (ST_AsEWKB) with IS DISTINCT FROM; fix
-- the trigger function's search_path. Who may call update_collector_location
-- is unchanged: signed-in active collectors for their own row, and the
-- backend (anon has no EXECUTE since 20261106_collector_tracking_realtime in
-- the collector repository). CREATE OR REPLACE keeps the existing grants.
--
-- Applied to production 2026-11-12 (owner approved) as 20261112000813.
-- Tested first inside a rolled-back transaction: the
-- function and the direct update both store the position and update
-- location_updated_at; another collector's row is still refused (42501).

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_collector_location_from_postgis()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- When current_location changes, keep latitude/longitude in step
  IF NEW.current_location IS NOT NULL
     AND (OLD.current_location IS NULL
          OR ST_AsEWKB(NEW.current_location) IS DISTINCT FROM ST_AsEWKB(OLD.current_location)) THEN
    NEW.current_latitude := ST_Y(NEW.current_location::geometry);
    NEW.current_longitude := ST_X(NEW.current_location::geometry);
    NEW.location_updated_at := NOW();
    NEW.last_active := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_collector_location(p_user_id uuid, p_longitude double precision, p_latitude double precision)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (p_user_id IS DISTINCT FROM auth.uid() OR NOT public.is_active_collector(auth.uid())) THEN
    RAISE EXCEPTION 'Only registered, active collectors can go On-Duty'
      USING ERRCODE = '42501';
  END IF;

  UPDATE collector_profiles
  SET
    current_latitude = p_latitude,
    current_longitude = p_longitude,
    current_location = ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326),
    location_updated_at = NOW(),
    last_active = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_collector_location(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_collector_location(uuid, double precision, double precision) TO authenticated, service_role;

COMMIT;
