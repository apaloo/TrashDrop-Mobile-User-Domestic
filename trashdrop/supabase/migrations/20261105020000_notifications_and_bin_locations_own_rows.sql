-- Notifications and bin locations: each user sees only their own, plus the
-- narrow collector and staff paths that the other apps really use.
--
-- Found in production, 2026-11-05:
--   notifications   "Enable read access / update for authenticated users"
--                   were USING (true): any signed-in user could read and edit
--                   every user's notifications. Insert was WITH CHECK (true).
--                   anon and authenticated held every table privilege,
--                   including TRUNCATE.
--   bin_locations   row level security was OFF, so its policies did nothing
--                   and every home address and coordinate was readable (and
--                   writable) by anyone holding the public API key, signed in
--                   or not. "Allow authenticated users to read bin_locations"
--                   (USING true) would have kept it open even with RLS on.
--
-- Who uses these tables (API logs 2026-11-04, app code, pg_proc):
--   notifications
--     household app  reads, marks read, deletes old ones: own rows only
--                    (.eq('user_id', user.id)); realtime on own rows. Its
--                    createNotification is a stub and never inserts.
--     collector app  POSTs pickup_accepted / collector_enroute /
--                    collector_arrived / pickup_disposed for the household
--                    whose bin or pickup it has just taken (no read-back).
--     admin portal   reads its own bell (user_id=eq.<own id>), a row count
--                    (select=*&limit=0), and marks its own as read.
--     database       td_alert_notify (trigger) and admin_review_account_role
--                    insert as SECURITY DEFINER owned by postgres: not
--                    affected by RLS.
--   bin_locations
--     household app  inserts, updates and reads its own; get_bin_coordinates_wkt
--                    (SECURITY INVOKER) for its own bin's coordinates.
--     collector app  digital_bins?select=*,bin_locations!location_id(
--                    coordinates,location_name) for the open pool
--                    (status=pending, no collector) and its own jobs
--                    (collector_id=eq.<own id>).
--     admin portal   reads by id lists (staff).
--     database       create_digital_bin, create_whatsapp_digital_bin,
--                    td_request_region, enforce_digital_bin_coverage,
--                    td_set_digital_bin_price, admin_set_request_location are
--                    SECURITY DEFINER; the urgent_digital_bins view runs as its
--                    owner; WhatsApp functions use the service role. None are
--                    affected by RLS.
--
-- What this does:
--   notifications
--     read    own rows; staff (td_is_staff()) read all
--     update  own rows only
--     delete  own rows only (the app's 30-day clean-up, which RLS silently
--             blocked until now because no delete rule existed)
--     insert  for yourself; staff; or a collector for a household whose
--             digital bin or pickup request is assigned to that collector
--             (td_collector_serves_household). Database functions and the
--             service role are not limited.
--     grants  anon loses everything; authenticated loses TRUNCATE,
--             REFERENCES, TRIGGER.
--   bin_locations
--     RLS turned on; the open read rule dropped; household own-row rules kept.
--     read    own rows (existing rule); staff; an active collector for a bin
--             that is waiting in the open pool or is assigned to them
--             (td_collector_can_see_bin_location).
--     grants  anon loses everything; authenticated loses TRUNCATE,
--             REFERENCES, TRIGGER.
--
-- No data is created or changed. Undo:
--   trashdrop/supabase/diagnostics/notifications_bin_locations_rollback.sql

SET LOCAL search_path = public;

DO $$
BEGIN
  IF to_regprocedure('public.td_collector_serves_household(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'already applied: td_collector_serves_household exists; nothing changed';
  END IF;
  IF to_regprocedure('public.td_is_staff()') IS NULL THEN
    RAISE EXCEPTION 'public.td_is_staff() is missing; nothing changed';
  END IF;
  IF to_regprocedure('public.td_is_active_collector(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.td_is_active_collector(uuid) is missing; nothing changed';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so the rules don't depend on (or recurse through)
-- the job tables' own read rules; each answers only about the caller.
-- ---------------------------------------------------------------------------

-- Is the signed-in collector assigned to a digital bin or pickup request of
-- this household?
CREATE FUNCTION public.td_collector_serves_household(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND p_household_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.digital_bins b
       WHERE b.user_id = p_household_id
         AND b.collector_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.pickup_requests r
       WHERE r.user_id = p_household_id
         AND r.collector_id = auth.uid()
    )
  );
$$;

-- May the signed-in collector see this bin location? Yes while one of its
-- digital bins waits in the open pool (pending, no collector) and the caller
-- is an active collector, or when the bin is assigned to the caller.
CREATE FUNCTION public.td_collector_can_see_bin_location(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND p_location_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.digital_bins b
     WHERE b.location_id = p_location_id
       AND (
         b.collector_id = auth.uid()
         OR (b.status = 'pending' AND b.collector_id IS NULL
             AND public.td_is_active_collector(auth.uid()))
       )
  );
$$;

REVOKE ALL ON FUNCTION public.td_collector_serves_household(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.td_collector_can_see_bin_location(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.td_collector_serves_household(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.td_collector_can_see_bin_location(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.notifications;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.notifications;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.notifications;

CREATE POLICY "notifications_read_own"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "notifications_read_staff"
  ON public.notifications FOR SELECT
  TO authenticated
  USING ((SELECT public.td_is_staff()));

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "notifications_insert_self_staff_or_collector"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR (SELECT public.td_is_staff())
    OR public.td_collector_serves_household(user_id)
  );

REVOKE ALL ON public.notifications FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.notifications FROM authenticated;

-- ---------------------------------------------------------------------------
-- bin_locations
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow authenticated users to read bin_locations" ON public.bin_locations;

CREATE POLICY "bin_locations_read_staff"
  ON public.bin_locations FOR SELECT
  TO authenticated
  USING ((SELECT public.td_is_staff()));

CREATE POLICY "bin_locations_read_collector_by_job"
  ON public.bin_locations FOR SELECT
  TO authenticated
  USING (public.td_collector_can_see_bin_location(id));

-- Kept as they are: "Users can view their own bin locations",
-- "Users can create bin locations", "Users can update their own bin locations".

ALTER TABLE public.bin_locations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.bin_locations FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.bin_locations FROM authenticated;
