-- Read-only checks before running
-- 20261104000000_collector_profiles_read_by_job.sql.
-- Changes nothing. Run in the Supabase SQL editor and keep the output: it is
-- the backup of the read rules and the coordinates function as they are now,
-- and the rollback restores exactly this.

-- 1. Read rules on collector_profiles today (expected: one, "Enable read
--    access for authenticated users", USING true)
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'collector_profiles'
 ORDER BY cmd, policyname;

-- 2. Row level security is on (expected: true)
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.collector_profiles'::regclass;

-- 3. The coordinates function today, and who may call it (expected: PUBLIC,
--    which includes signed-out callers)
SELECT pg_get_functiondef('public.get_collector_coordinates_wkt(uuid)'::regprocedure) AS definition;
SELECT p.proacl FROM pg_proc p WHERE p.oid = 'public.get_collector_coordinates_wkt(uuid)'::regprocedure;

-- 4. What the new rules rely on (expected: all present)
SELECT to_regprocedure('public.td_is_staff()') AS td_is_staff,
       to_regprocedure('public.td_household_can_follow(uuid)') AS already_applied_if_not_null;
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('digital_bins', 'pickup_requests')
   AND column_name IN ('user_id', 'collector_id', 'status')
 ORDER BY 1, 2;

-- 5. Jobs in the "on the way" window right now (their households keep the
--    collector's location; everyone else stops seeing it)
SELECT 'digital_bins' AS jobs, status, count(*)
  FROM public.digital_bins
 WHERE status IN ('accepted', 'active', 'en_route', 'in_transit', 'arrived')
 GROUP BY status
UNION ALL
SELECT 'pickup_requests', status, count(*)
  FROM public.pickup_requests
 WHERE status IN ('accepted', 'active', 'en_route', 'in_transit', 'arrived')
 GROUP BY status;
