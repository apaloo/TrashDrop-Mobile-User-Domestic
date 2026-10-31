-- Read-only checks before running
-- 20261101000000_recent_activity_own_rows_only.sql.
-- Changes nothing. Run in the Supabase SQL editor and keep the output: it is
-- the backup of the view as it is now (its definition, owner, options and
-- grants), and the rollback restores exactly this.

-- 1. The view's definition today (the migration keeps it unchanged, under the
--    name user_recent_activity_all)
SELECT pg_get_viewdef('public.user_recent_activity'::regclass, true) AS definition;

-- 2. Owner and options (expected: owner postgres, no security_invoker; that is
--    why it ignores the row level security of the tables it reads)
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.reloptions
  FROM pg_class c
 WHERE c.oid = 'public.user_recent_activity'::regclass;

-- 3. Columns (the app filters on user_id; the migration needs that column)
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'user_recent_activity'
 ORDER BY ordinal_position;

-- 4. Who can read or write it today (expected: anon and authenticated)
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'user_recent_activity'
 GROUP BY grantee
 ORDER BY grantee;

-- 5. Views or rules built on it (expected: none). Anything listed keeps reading
--    every row through user_recent_activity_all after the migration.
SELECT DISTINCT dependent.relname AS dependent_object, dependent.relkind
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid
  JOIN pg_class dependent ON dependent.oid = r.ev_class
 WHERE d.refobjid = 'public.user_recent_activity'::regclass
   AND dependent.oid <> 'public.user_recent_activity'::regclass;

-- 6. Functions that mention it by name (expected: none). After the migration
--    these read the new view: own rows for app users, every row for the
--    service role and SECURITY DEFINER functions owned by postgres.
SELECT n.nspname AS schema, p.proname AS function, p.prosecdef AS security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.prosrc ILIKE '%user_recent_activity%'
   AND n.nspname NOT IN ('pg_catalog', 'information_schema');

-- 7. Nothing is in the way of the new name (expected: NULL)
SELECT to_regclass('public.user_recent_activity_all') AS existing_all_view;

-- 8. Rows today, by user count (for comparison afterwards)
SELECT count(*) AS rows, count(DISTINCT user_id) AS users FROM public.user_recent_activity;
