-- Undo trashdrop/supabase/migrations/20261104000000_collector_profiles_read_by_job.sql
--
-- Puts back the open read rule on collector_profiles (every signed-in user
-- reads every row) and the coordinates function as it was (any caller, signed
-- in or not), and drops the two new functions. If the preflight output showed
-- something different, restore that instead. One transaction. No data is
-- changed.
--
-- If the household app already reads td_collector_display_profile, roll it
-- back first: without that function it shows no collector name or phone.

BEGIN;
SET LOCAL search_path = public;

DO $$
BEGIN
  IF to_regprocedure('public.td_household_can_follow(uuid)') IS NULL THEN
    RAISE EXCEPTION 'not applied: td_household_can_follow does not exist; nothing changed';
  END IF;
END $$;

DROP POLICY collector_profiles_read_own ON public.collector_profiles;
DROP POLICY collector_profiles_read_staff ON public.collector_profiles;
DROP POLICY collector_profiles_read_household_on_the_way ON public.collector_profiles;
CREATE POLICY "Enable read access for authenticated users"
  ON public.collector_profiles FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.get_collector_coordinates_wkt(collector_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_result TEXT;
BEGIN
  -- Get coordinates as WKT text from collector_profiles
  SELECT ST_AsText(current_location::geometry)
  INTO v_result
  FROM collector_profiles
  WHERE user_id = collector_user_id;
  
  RETURN v_result;
END;
$function$;
ALTER FUNCTION public.get_collector_coordinates_wkt(uuid) RESET search_path;
GRANT EXECUTE ON FUNCTION public.get_collector_coordinates_wkt(uuid) TO PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.td_collector_display_profile(uuid);
DROP FUNCTION public.td_household_can_follow(uuid);

NOTIFY pgrst, 'reload schema';

COMMIT;
