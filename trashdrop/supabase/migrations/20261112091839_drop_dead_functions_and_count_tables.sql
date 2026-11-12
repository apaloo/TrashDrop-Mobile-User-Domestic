-- Database tidy-up, round 2 (tech-debt TD37, TD21)
--
-- 1. Three functions nothing uses, each broken:
--    - process_qr_scan(uuid, text): selects batches.qr_code, which doesn't
--      exist. Its only caller (household onboardingService.processQRScan)
--      had no caller and was removed in #131.
--    - check_dumping_duplicate(...): fails with 'record "nearest_report" is
--      not assigned yet' when no report is nearby. Only called by
--    - prevent_duplicate_dumping_reports(): a trigger function attached to no
--      table.
--    Checked on production 2026-11-12: no app, Edge Function, Netlify
--    function, view, policy, trigger or cron job uses them; 0 API calls in
--    24 hours; the drop was run rolled back first (3 functions before, 0
--    after, no dependency errors).
--
-- 2. Nine one-row count tables (bag_count, batch_count, dumping_count,
--    log_count, message_count, notification_count, scan_count,
--    service_area_count, waste_item_count): each holds one old snapshot
--    number (for example bag_count = 68), has no primary key, and is read by
--    no app and no function. Live counts come from the tables themselves.
--
-- Kept on purpose: the *_backup_2026* tables (owner decides: export, then
-- drop) and logs_archive (td_archive_old_logs writes to it).
--
-- check_dumping_duplicate was also a SECURITY DEFINER function without a
-- caller check (secure development principle 8); dropping it removes that.
--
-- Rollback: supabase/diagnostics/drop_dead_functions_and_count_tables_rollback.sql
-- (definitions exported from production before the drop; anon not re-granted).

begin;

drop function if exists public.prevent_duplicate_dumping_reports();
drop function if exists public.check_dumping_duplicate(uuid, numeric, numeric, numeric, integer);
drop function if exists public.process_qr_scan(uuid, text);

drop table if exists public.bag_count;
drop table if exists public.batch_count;
drop table if exists public.dumping_count;
drop table if exists public.log_count;
drop table if exists public.message_count;
drop table if exists public.notification_count;
drop table if exists public.scan_count;
drop table if exists public.service_area_count;
drop table if exists public.waste_item_count;

commit;
