-- Collector profiles: who may read a collector's row, and their location.
--
-- A collector's row (public.collector_profiles) holds their live location
-- (current_location, current_latitude/longitude, location_updated_at), phone
-- and email. Its only read rule let every signed-in user read every row, and
-- get_collector_coordinates_wkt (SECURITY DEFINER, executable by PUBLIC)
-- returned any collector's coordinates to any caller. A household needs a
-- collector's location only while that collector is coming to them, and after
-- the scan ('collecting') the collector's next stops are other households.
--
-- Who reads this table today:
--   collectors app   its own row only (.eq('user_id', <own id>))
--   admin portal     not directly; staff functions and views run as owner,
--                    and admin_pickup_requests (security_invoker) is read by
--                    staff, who keep access
--   household app    CollectorTracking.js: the collector's location and live
--                    feed while tracking; pickupService.js: name, phone,
--                    rating and vehicle for the pickup screens, now through
--                    td_collector_display_profile (below)
--
-- What this does:
--   1. td_household_can_follow(collector): true while the signed-in user has
--      a digital bin or pickup request with that collector that is accepted,
--      en route or arrived (the same window as the app's TRACKABLE_STATUSES).
--   2. Replaces the open read rule with three: a collector's own row, staff
--      (td_is_staff()), and a household on the way (td_household_can_follow).
--      Realtime applies the same rules, so the live feed stops at pickup.
--   3. get_collector_coordinates_wkt keeps its signature but answers only the
--      same callers (and the service role); signed-out callers lose access.
--   4. td_collector_display_profile(collector): name, phone, rating, vehicle,
--      photo, status and region (no location, no email) for a collector on
--      any of the caller's own pickups, so the pickup screens keep showing
--      who is collecting after the location stops.
--
-- Ship order: apply this first, then deploy the household app change that
-- reads td_collector_display_profile (the function must exist before the app
-- calls it). In between, the old app shows no collector name on pickups
-- that are already collected; nothing else changes for it.
-- No data is created or changed.
-- Run the preflight first and keep its output:
--   trashdrop/supabase/diagnostics/collector_profiles_read_by_job_preflight.sql
-- One transaction: if any step fails, nothing changes. Running it a second
-- time stops at the first check with "already applied" and changes nothing.
-- Undo: trashdrop/supabase/diagnostics/collector_profiles_read_by_job_rollback.sql

BEGIN;
SET LOCAL search_path = public;

DO $$
BEGIN
  IF to_regprocedure('public.td_household_can_follow(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'already applied: td_household_can_follow exists; nothing changed';
  END IF;
  IF to_regprocedure('public.td_is_staff()') IS NULL THEN
    RAISE EXCEPTION 'public.td_is_staff() is missing; nothing changed';
  END IF;
  IF to_regprocedure('public.get_collector_coordinates_wkt(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.get_collector_coordinates_wkt(uuid) is missing; nothing changed';
  END IF;
END $$;

-- 1. Is the signed-in household waiting for this collector right now?
-- SECURITY DEFINER so the rule doesn't depend on (or recurse through) the job
-- tables' own read rules; it only ever answers about the caller's own jobs.
CREATE FUNCTION public.td_household_can_follow(p_collector_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND p_collector_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.digital_bins b
       WHERE b.user_id = auth.uid()
         AND b.collector_id = p_collector_id
         AND b.status IN ('accepted', 'active', 'en_route', 'in_transit', 'arrived')
    )
    OR EXISTS (
      SELECT 1 FROM public.pickup_requests r
       WHERE r.user_id = auth.uid()
         AND r.collector_id = p_collector_id
         AND r.status IN ('accepted', 'active', 'en_route', 'in_transit', 'arrived')
    )
  );
$$;

REVOKE ALL ON FUNCTION public.td_household_can_follow(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.td_household_can_follow(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.td_household_can_follow(uuid) IS
  'True while the signed-in user has a digital bin or pickup request with this collector that is accepted, en route or arrived. See 20261104000000_collector_profiles_read_by_job.sql.';

-- 2. Read rules on collector_profiles
DROP POLICY "Enable read access for authenticated users" ON public.collector_profiles;

CREATE POLICY collector_profiles_read_own
  ON public.collector_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY collector_profiles_read_staff
  ON public.collector_profiles FOR SELECT TO authenticated
  USING (public.td_is_staff());

CREATE POLICY collector_profiles_read_household_on_the_way
  ON public.collector_profiles FOR SELECT TO authenticated
  USING (public.td_household_can_follow(user_id));

-- 3. The coordinates function: same signature, same answer, but only for the
-- collector themselves, staff, the service role, or a household on the way
CREATE OR REPLACE FUNCTION public.get_collector_coordinates_wkt(collector_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result TEXT;
BEGIN
  IF NOT (
    collector_user_id = auth.uid()
    OR public.td_is_staff()
    OR coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    OR public.td_household_can_follow(collector_user_id)
  ) THEN
    RETURN NULL;
  END IF;

  -- Get coordinates as WKT text from collector_profiles
  SELECT ST_AsText(current_location::geometry)
  INTO v_result
  FROM collector_profiles
  WHERE user_id = collector_user_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_collector_coordinates_wkt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_collector_coordinates_wkt(uuid) TO authenticated, service_role;

-- 4. Who is collecting: display details only, for the caller's own pickups
CREATE FUNCTION public.td_collector_display_profile(p_collector_id uuid)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  phone text,
  rating numeric,
  vehicle_type text,
  vehicle_plate text,
  vehicle_color text,
  profile_image_url text,
  status text,
  region text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.user_id, c.first_name, c.last_name, c.phone, c.rating,
         c.vehicle_type, c.vehicle_plate, c.vehicle_color,
         c.profile_image_url, c.status, c.region
    FROM public.collector_profiles c
   WHERE c.user_id = p_collector_id
     AND auth.uid() IS NOT NULL
     AND (
       c.user_id = auth.uid()
       OR public.td_is_staff()
       OR EXISTS (SELECT 1 FROM public.digital_bins b
                   WHERE b.user_id = auth.uid() AND b.collector_id = p_collector_id)
       OR EXISTS (SELECT 1 FROM public.pickup_requests r
                   WHERE r.user_id = auth.uid() AND r.collector_id = p_collector_id)
     );
$$;

REVOKE ALL ON FUNCTION public.td_collector_display_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.td_collector_display_profile(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.td_collector_display_profile(uuid) IS
  'Name, phone, rating and vehicle of a collector on one of the caller''s own pickups (no location, no email). See 20261104000000_collector_profiles_read_by_job.sql.';

-- Let the API see the new functions straight away
NOTIFY pgrst, 'reload schema';

COMMIT;
