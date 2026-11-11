-- Close anonymous (public API key) access to personal data and to staff-only
-- operations. Stage 1 of fixing the Supabase security advisor findings of
-- 2026-11-11.
--
-- The public key is built into every copy of the apps, so "anon" means
-- anyone on the internet. Before this migration, anon could:
--   * read every user's email and name through the view user_stats_dashboard
--     (a SECURITY DEFINER view over auth.users);
--   * call get_user_emails / get_user_contacts, which return emails and
--     phone numbers without checking the caller;
--   * call staff and maintenance functions that change data without
--     checking the caller (assigning and merging dumping reports, back-fills).
--
-- This stage only removes anon. Signed-in users keep the access they had,
-- so every app screen keeps working: all callers in the three apps run
-- after sign-in, and no Netlify or Edge Function calls these objects.
-- Stage 2 (separate pull request, tested on staging): restrict these to
-- their owner or to staff, and switch the views to security_invoker.
--
-- Not touched: digital bin pricing and promotion objects (protected, see
-- CLAUDE.md), the WhatsApp booking functions, payout functions, and the
-- public dumping-report map view (public_illegal_dumping_reports).
--
-- Rollback: supabase/diagnostics/close_anon_access_to_personal_data_rollback.sql

begin;

-- 1. Views: no anonymous reads.
do $$
declare v text;
begin
  foreach v in array array[
    'user_stats_dashboard',        -- emails and names of all users
    'user_recent_activity',
    'user_dumping_activity',
    'unified_pickup_status',
    'urgent_digital_bins',         -- addresses
    'collector_assignments_view'   -- locations, photos, reporter ids
  ] loop
    if to_regclass('public.' || v) is not null then
      execute format('revoke all on public.%I from anon, public', v);
      execute format('grant select on public.%I to authenticated, service_role', v);
    end if;
  end loop;
end $$;

-- 2. Functions: no anonymous calls. Every overload of each name.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        -- personal data
        'get_user_emails',
        'get_user_contacts',
        -- staff-only changes to dumping reports
        'assign_cleanup_team',
        'merge_dumping_reports',
        'merge_dumping_reports_comprehensive',
        'merge_dumping_reports_fixed',
        'test_merge_dumping_reports',
        'update_illegal_dumping_status',
        'clean_blob_urls_from_photos',
        -- maintenance jobs
        'backfill_bag_user_ids',
        'backfill_bags_for_active_batches',
        'backfill_bags_for_used_batches',
        'refresh_all_user_stats',
        'cleanup_expired_assignments',
        'cleanup_expired_reservations',
        -- carter actions (the carter app is always signed in)
        'accept_pickup_request',
        'mark_request_picked_up',
        'dispose_bags'
      ])
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

commit;
