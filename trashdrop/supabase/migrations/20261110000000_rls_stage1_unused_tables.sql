-- Stage 1 of 3: tables no app reads or writes.
--
-- Supabase security advisor, 2026-11-10: row level security was OFF on these
-- tables, so anyone holding the public API key could read, change or wipe
-- them. Who uses them (pg_stat_statements by role, pg_proc, app code on main
-- of the household, collector and admin apps):
--   bag_count, batch_count, dumping_count, log_count, message_count,
--   notification_count, scan_count, service_area_count, waste_item_count,
--   bag_types
--     apps        none (no .from() in any of the three apps)
--     database    no function reads them (functions matching "bag_count" read
--                 the column of that name on other tables)
--     reads seen  postgres (dashboard table editor) and service_role only
--   user_stats_dashboard (view)
--     household app reads its own row (the view filters to auth.uid()); before
--     the session loads it reads as anon and gets no rows. The view joins
--     auth.users, which is why the advisor flags it.
--
-- What this does:
--   - RLS on for the ten tables, no policies: only the service role and
--     database functions (owned by postgres) can use them.
--   - anon and authenticated lose TRUNCATE, REFERENCES and TRIGGER on them
--     (TRUNCATE is not limited by RLS).
--   - the view keeps SELECT for anon and authenticated (revoking it would turn
--     the household app's early empty reads into errors it throws on); it
--     loses every write privilege, which it could never honour anyway.
-- Not changed: spatial_ref_sys (PostGIS-owned, no API grants).

do $$
declare
  t text;
begin
  foreach t in array array[
    'bag_count','batch_count','dumping_count','log_count','message_count',
    'notification_count','scan_count','service_area_count','waste_item_count',
    'bag_types'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t);
  end loop;
end
$$;

revoke insert, update, delete, truncate, references, trigger
  on public.user_stats_dashboard from anon, authenticated;
