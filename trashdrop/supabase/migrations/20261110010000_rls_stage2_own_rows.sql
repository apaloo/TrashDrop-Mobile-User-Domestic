-- Stage 2 of 3: tables each household works with only its own rows.
--
-- Row level security was OFF, so the policies already written on these tables
-- did nothing and every row was readable and writable with the public API key.
-- Who uses them (pg_stat_statements by role, pg_proc, app code on main):
--   locations          household app: reads, inserts, deletes its own
--                      (.eq('user_id', ...)). Collector and admin apps: none.
--                      admin_pickup_requests reads it only through
--                      scheduled_pickups, which has no rows.
--   user_activity      household app: reads and inserts its own. Realtime.
--   user_stats         household app: reads and upserts its own. Realtime.
--   scheduled_pickups  household app: own rows; the table is empty.
--   payment_methods    household app (paymentService): own rows; the table is
--                      empty and had no policies.
--   illegal_dumping_history_mobile
--                      household app inserts a history line when a report's
--                      status changes; signed-in reads by dumping_id.
--   database           every cross-user write (points, stats, onboarding,
--                      locations from bookings) is a SECURITY DEFINER function
--                      owned by postgres, so RLS does not limit it. WhatsApp
--                      functions use the service role.
--
-- Visible change: a request sent before the household app's session has
-- loaded (as anon) now gets no rows instead of the user's data; the app reads
-- again once signed in.
--
-- What this does:
--   - RLS on for all six tables; existing own-row policies kept.
--   - payment_methods: own rows for signed-in users.
--   - illegal_dumping_history_mobile: read and add history for a report you
--     can see; illegal_dumping_mobile's own rules decide which those are.
--   - anon and authenticated lose TRUNCATE, REFERENCES and TRIGGER.

create policy payment_methods_own on public.payment_methods
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy dumping_history_read_visible_report on public.illegal_dumping_history_mobile
  for select to authenticated
  using (exists (select 1 from public.illegal_dumping_mobile d where d.id = dumping_id));

create policy dumping_history_add_visible_report on public.illegal_dumping_history_mobile
  for insert to authenticated
  with check (exists (select 1 from public.illegal_dumping_mobile d where d.id = dumping_id));

do $$
declare
  t text;
begin
  foreach t in array array[
    'locations','user_activity','user_stats','scheduled_pickups',
    'payment_methods','illegal_dumping_history_mobile'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t);
  end loop;
end
$$;
