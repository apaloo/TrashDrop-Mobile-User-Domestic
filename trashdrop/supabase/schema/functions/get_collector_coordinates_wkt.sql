-- Function public.get_collector_coordinates_wkt
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_collector_coordinates_wkt(collector_user_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_collector_coordinates_wkt(collector_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
