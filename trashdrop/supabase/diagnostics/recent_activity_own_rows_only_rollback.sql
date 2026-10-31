-- Undo trashdrop/supabase/migrations/20261101000000_recent_activity_own_rows_only.sql
--
-- Drops the own-rows view and gives the original view back its name and the
-- access it had before: SELECT for anon and authenticated (every row visible to
-- anyone who can SELECT it, as before). If the preflight output showed other
-- privileges, grant those instead. One transaction. No data is changed.

BEGIN;
SET LOCAL search_path = public;

DO $$
BEGIN
  IF to_regclass('public.user_recent_activity_all') IS NULL THEN
    RAISE EXCEPTION 'not applied: public.user_recent_activity_all does not exist; nothing changed';
  END IF;
END $$;

DROP VIEW public.user_recent_activity;
ALTER VIEW public.user_recent_activity_all RENAME TO user_recent_activity;
COMMENT ON VIEW public.user_recent_activity IS NULL;
GRANT SELECT ON public.user_recent_activity TO anon, authenticated;
GRANT ALL ON public.user_recent_activity TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
