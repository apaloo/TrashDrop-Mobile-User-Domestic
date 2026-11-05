-- Undo 20261105020000_notifications_and_bin_locations_own_rows.sql.
-- Puts back the state found on 2026-11-05 (open read/update/insert on
-- notifications, RLS off on bin_locations, full anon grants). Only run this
-- if the migration broke something you can't fix forward: it reopens the leak.

BEGIN;
SET LOCAL search_path = public;

DROP POLICY IF EXISTS "notifications_read_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_read_staff" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_self_staff_or_collector" ON public.notifications;

CREATE POLICY "Enable read access for authenticated users"
  ON public.notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable update for authenticated users"
  ON public.notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable insert for authenticated users"
  ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

GRANT ALL ON public.notifications TO anon, authenticated;

DROP POLICY IF EXISTS "bin_locations_read_staff" ON public.bin_locations;
DROP POLICY IF EXISTS "bin_locations_read_collector_by_job" ON public.bin_locations;
CREATE POLICY "Allow authenticated users to read bin_locations"
  ON public.bin_locations FOR SELECT TO authenticated USING (true);
ALTER TABLE public.bin_locations DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bin_locations TO anon, authenticated;

DROP FUNCTION IF EXISTS public.td_collector_serves_household(uuid);
DROP FUNCTION IF EXISTS public.td_collector_can_see_bin_location(uuid);

COMMIT;
