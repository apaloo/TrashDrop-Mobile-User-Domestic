-- Database security (TD19; Supabase advisor function_search_path_mutable;
-- owner's approval 2026-11-12). Every function in public that doesn't fix its
-- search_path gets the database's own default order (public, extensions) with
-- temporary objects last, so names resolve as they do today and a planted
-- temporary object can't stand in for a real one. Extension functions are
-- skipped. create_promotional_usage_on_signup (a trigger on auth.users that
-- runs under the auth service's own search_path, and part of the protected
-- pricing rules) is reviewed separately.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND p.proname <> 'create_promotional_usage_on_signup'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', f);
  END LOOP;
END $$;
