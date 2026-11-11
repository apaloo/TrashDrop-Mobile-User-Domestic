-- Rollback for 20261111140000_close_anon_access_to_personal_data.sql.
-- Restores anonymous access exactly as it was. Only run this if a signed-out
-- screen breaks, and then fix that screen instead of leaving this in place:
-- it re-exposes users' emails and phone numbers.

begin;

do $$
declare v text;
begin
  foreach v in array array['user_stats_dashboard','user_recent_activity','user_dumping_activity',
                           'unified_pickup_status','urgent_digital_bins','collector_assignments_view'] loop
    if to_regclass('public.' || v) is not null then
      execute format('grant select on public.%I to anon', v);
    end if;
  end loop;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array['get_user_emails','get_user_contacts','assign_cleanup_team',
        'merge_dumping_reports','merge_dumping_reports_comprehensive','merge_dumping_reports_fixed',
        'test_merge_dumping_reports','update_illegal_dumping_status','clean_blob_urls_from_photos',
        'backfill_bag_user_ids','backfill_bags_for_active_batches','backfill_bags_for_used_batches',
        'refresh_all_user_stats','cleanup_expired_assignments','cleanup_expired_reservations',
        'accept_pickup_request','mark_request_picked_up','dispose_bags'])
  loop
    execute format('grant execute on function %s to public, anon', f.sig);
  end loop;
end $$;

commit;
