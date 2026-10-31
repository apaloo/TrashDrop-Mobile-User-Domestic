-- Recent Activity: each signed-in user reads only their own activity.
--
-- The household dashboard's Recent Activity comes from the view
-- public.user_recent_activity (userServiceOptimized.getRecentActivityOptimized,
-- which only ever asks for its own rows: .eq('user_id', <own id>)). The view is
-- owned by postgres without security_invoker, so it ignores the row level
-- security of the tables it reads, and anon and authenticated can SELECT it:
-- anyone with the public key, signed in or not, could read every user's
-- activity (what they reported or scanned, and when). Same problem as
-- user_stats_dashboard, fixed in 20261025000000.
--
-- What this does, without needing (or changing) the view's own definition:
--   1. Renames the existing view to user_recent_activity_all, unchanged, and
--      takes away anon's and authenticated's access to it.
--   2. Creates public.user_recent_activity again as a thin view over it, with
--      the same columns in the same order, returning only the signed-in user's
--      rows. The service role and database roles (SQL editor, backend) still
--      see every row. security_barrier keeps the filter from being bypassed.
--   3. Gives anon and authenticated SELECT only on the new view (a signed-out
--      caller gets no rows rather than an error).
--
-- The app needs no change. No data is created or changed.
-- Run the preflight first and keep its output:
--   trashdrop/supabase/diagnostics/recent_activity_own_rows_only_preflight.sql
-- One transaction: if any step fails, nothing changes. Running it a second
-- time stops at the first check with "already applied" and changes nothing.
-- Undo: trashdrop/supabase/diagnostics/recent_activity_own_rows_only_rollback.sql

BEGIN;
SET LOCAL search_path = public;

DO $$
BEGIN
  IF to_regclass('public.user_recent_activity_all') IS NOT NULL THEN
    RAISE EXCEPTION 'already applied: public.user_recent_activity_all exists; nothing changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'user_recent_activity'
       AND column_name = 'user_id'
  ) THEN
    RAISE EXCEPTION 'public.user_recent_activity has no user_id column; nothing changed';
  END IF;
END $$;

-- 1. Keep the existing view, unchanged, under a new name; app roles lose access
ALTER VIEW public.user_recent_activity RENAME TO user_recent_activity_all;
REVOKE ALL ON public.user_recent_activity_all FROM PUBLIC, anon, authenticated;

COMMENT ON VIEW public.user_recent_activity_all IS
  'Every user''s recent activity. Not readable by app users; they read public.user_recent_activity (own rows only). See 20261101000000_recent_activity_own_rows_only.sql.';

-- 2. Same name, same columns, own rows only
CREATE VIEW public.user_recent_activity WITH (security_barrier = true) AS
  SELECT a.*
    FROM public.user_recent_activity_all a
   -- Signed-in users (and anon) see only their own rows; the service role and
   -- database roles see every row
   WHERE a.user_id::text = auth.uid()::text
      OR current_user NOT IN ('anon', 'authenticated');

-- 3. Read-only for the app
REVOKE ALL ON public.user_recent_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_recent_activity TO anon, authenticated;
GRANT ALL ON public.user_recent_activity TO service_role;

COMMENT ON VIEW public.user_recent_activity IS
  'Recent activity for the household dashboard. App users see only their own rows; see 20261101000000_recent_activity_own_rows_only.sql.';

-- Let the API see the new view straight away
NOTIFY pgrst, 'reload schema';

COMMIT;
