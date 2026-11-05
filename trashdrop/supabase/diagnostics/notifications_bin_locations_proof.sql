-- Proof for 20261105020000_notifications_and_bin_locations_own_rows.sql.
-- Applies the migration inside a transaction, acts as a household, a
-- collector, staff and anon, and ends by raising an error that carries the
-- results, so nothing is ever kept. Run it whole (SQL editor or MCP
-- execute_sql) against production before applying the migration.
-- Real accounts as of 2026-11-05:
--   810809ea household, bin 72613fa3 being collected by 23ac6952
--   23ac6952 collector; 825e5ec9 a household it has never served
--   22cb8368 staff (td_admin_emails)
BEGIN;
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

CREATE TEMP TABLE proof(k text, v text);
GRANT ALL ON proof TO authenticated, anon;

CREATE FUNCTION pg_temp.act(p uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p, 'role', 'authenticated',
                      'email', (SELECT email FROM auth.users WHERE id = p))::text, true);
$f$;

-- expected numbers, computed as owner
INSERT INTO proof SELECT 'exp total notifs', count(*)::text FROM notifications;
INSERT INTO proof SELECT 'exp total binlocs', count(*)::text FROM bin_locations;
INSERT INTO proof SELECT 'exp C2 binlocs', count(DISTINCT l.id)::text FROM bin_locations l JOIN digital_bins b ON b.location_id = l.id
  WHERE b.collector_id = '23ac6952-c55e-4614-8f23-3caaf373fed7' OR (b.status = 'pending' AND b.collector_id IS NULL);

-- Household H (810809ea): 2 notifications, bin 72613fa3 being collected by C2
SELECT pg_temp.act('810809ea-9444-4980-a2f2-024f2deadfb0');
SET LOCAL ROLE authenticated;
INSERT INTO proof SELECT 'H notifs visible (own=2)', count(*)::text FROM notifications;
INSERT INTO proof SELECT 'H notifs of others visible', count(*)::text FROM notifications WHERE user_id <> '810809ea-9444-4980-a2f2-024f2deadfb0';
INSERT INTO proof SELECT 'H binlocs visible', count(*)::text FROM bin_locations;
INSERT INTO proof SELECT 'H binlocs of others visible', count(*)::text FROM bin_locations WHERE user_id <> '810809ea-9444-4980-a2f2-024f2deadfb0';
WITH u AS (UPDATE notifications SET read = read WHERE user_id <> '810809ea-9444-4980-a2f2-024f2deadfb0' RETURNING 1) INSERT INTO proof SELECT 'H updates others', count(*)::text FROM u;
WITH u AS (UPDATE notifications SET read = true WHERE user_id = '810809ea-9444-4980-a2f2-024f2deadfb0' RETURNING 1) INSERT INTO proof SELECT 'H updates own', count(*)::text FROM u;
WITH u AS (DELETE FROM notifications WHERE user_id <> '810809ea-9444-4980-a2f2-024f2deadfb0' RETURNING 1) INSERT INTO proof SELECT 'H deletes others', count(*)::text FROM u;
INSERT INTO proof SELECT 'H own bin coords (wkt)', coalesce(left(get_bin_coordinates_wkt('72613fa3-db62-4475-871f-dc58e5fd047c'), 12), 'NULL');
INSERT INTO proof SELECT 'H other bin coords (wkt)', coalesce(left(get_bin_coordinates_wkt('16fe8acf-9aa6-4650-8858-28a6ea29e745'), 12), 'NULL');
DO $d$ BEGIN
  INSERT INTO notifications(user_id, title, message, type) VALUES ('810809ea-9444-4980-a2f2-024f2deadfb0', 't', 'm', 'info');
  INSERT INTO proof VALUES ('H insert for self', 'ok');
EXCEPTION WHEN others THEN INSERT INTO proof VALUES ('H insert for self', SQLSTATE || ' ' || SQLERRM); END $d$;
DO $d$ BEGIN
  INSERT INTO notifications(user_id, title, message, type) VALUES ('9ac7b8fc-6c40-4bc2-a771-f6b041b49e1e', 't', 'm', 'info');
  INSERT INTO proof VALUES ('H insert for other household', 'ok');
EXCEPTION WHEN others THEN INSERT INTO proof VALUES ('H insert for other household', SQLSTATE || ' ' || SQLERRM); END $d$;
DO $d$ BEGIN
  INSERT INTO bin_locations(user_id, location_name, address) VALUES ('810809ea-9444-4980-a2f2-024f2deadfb0', 'proof', 'proof');
  INSERT INTO proof VALUES ('H insert own bin_location', 'ok');
EXCEPTION WHEN others THEN INSERT INTO proof VALUES ('H insert own bin_location', SQLSTATE || ' ' || SQLERRM); END $d$;
WITH u AS (UPDATE bin_locations SET location_name = location_name WHERE user_id <> '810809ea-9444-4980-a2f2-024f2deadfb0' RETURNING 1) INSERT INTO proof SELECT 'H updates others binlocs', count(*)::text FROM u;
RESET ROLE;

-- Collector C2 (23ac6952): serves 810809ea, 9f49907e, 3d291ef9, 9ac7b8fc; not 825e5ec9
SELECT pg_temp.act('23ac6952-c55e-4614-8f23-3caaf373fed7');
SET LOCAL ROLE authenticated;
INSERT INTO proof SELECT 'C2 binlocs visible', count(*)::text FROM bin_locations;
INSERT INTO proof SELECT 'C2 pool embed (pending w/ location)', count(*)::text FROM digital_bins b LEFT JOIN bin_locations l ON l.id = b.location_id WHERE b.status = 'pending' AND l.coordinates IS NOT NULL;
INSERT INTO proof SELECT 'C2 own jobs embed (collecting w/ location)', count(*)::text FROM digital_bins b JOIN bin_locations l ON l.id = b.location_id WHERE b.collector_id = '23ac6952-c55e-4614-8f23-3caaf373fed7' AND b.status = 'collecting';
INSERT INTO proof SELECT 'C2 sees C1 arrived bin 16fe8acf', count(*)::text FROM bin_locations WHERE id = '16fe8acf-9aa6-4650-8858-28a6ea29e745';
INSERT INTO proof SELECT 'C2 notifs of others visible', count(*)::text FROM notifications WHERE user_id <> '23ac6952-c55e-4614-8f23-3caaf373fed7';
DO $d$ BEGIN
  INSERT INTO notifications(user_id, title, message, type) VALUES ('810809ea-9444-4980-a2f2-024f2deadfb0', 'Collector arrived', 'm', 'collector_arrived');
  INSERT INTO proof VALUES ('C2 notify served household', 'ok');
EXCEPTION WHEN others THEN INSERT INTO proof VALUES ('C2 notify served household', SQLSTATE || ' ' || SQLERRM); END $d$;
DO $d$ BEGIN
  INSERT INTO notifications(user_id, title, message, type) VALUES ('825e5ec9-bed6-4ca8-89b6-b6f34ecb4630', 'spam', 'm', 'info');
  INSERT INTO proof VALUES ('C2 notify unrelated household', 'ok');
EXCEPTION WHEN others THEN INSERT INTO proof VALUES ('C2 notify unrelated household', SQLSTATE || ' ' || SQLERRM); END $d$;
RESET ROLE;

-- Staff S (22cb8368, admin email list)
SELECT pg_temp.act('22cb8368-ba81-4fd7-8429-820d4652e8b1');
SET LOCAL ROLE authenticated;
INSERT INTO proof SELECT 'S notifs visible (=total)', count(*)::text FROM notifications;
INSERT INTO proof SELECT 'S binlocs visible (=total)', count(*)::text FROM bin_locations;
WITH u AS (UPDATE notifications SET read = read WHERE user_id <> '22cb8368-ba81-4fd7-8429-820d4652e8b1' RETURNING 1) INSERT INTO proof SELECT 'S updates others notifs', count(*)::text FROM u;
RESET ROLE;

-- anon (public API key, signed out)
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $d$ BEGIN PERFORM count(*) FROM notifications; INSERT INTO proof VALUES ('anon read notifications', 'ok');
EXCEPTION WHEN others THEN INSERT INTO proof VALUES ('anon read notifications', SQLSTATE); END $d$;
DO $d$ BEGIN PERFORM count(*) FROM bin_locations; INSERT INTO proof VALUES ('anon read bin_locations', 'ok');
EXCEPTION WHEN others THEN INSERT INTO proof VALUES ('anon read bin_locations', SQLSTATE); END $d$;
RESET ROLE;

INSERT INTO proof SELECT 'authenticated TRUNCATE notifications', has_table_privilege('authenticated', 'public.notifications', 'TRUNCATE')::text;
INSERT INTO proof SELECT 'authenticated TRUNCATE bin_locations', has_table_privilege('authenticated', 'public.bin_locations', 'TRUNCATE')::text;
INSERT INTO proof SELECT 'bin_locations RLS on', relrowsecurity::text FROM pg_class WHERE oid = 'public.bin_locations'::regclass;

DO $d$ BEGIN
  RAISE EXCEPTION 'PROOF (rolled back): %', (SELECT json_agg(json_build_array(k, v)) FROM proof);
END $d$;
