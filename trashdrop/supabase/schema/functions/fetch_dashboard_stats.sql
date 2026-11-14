-- Function public.fetch_dashboard_stats
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- fetch_dashboard_stats(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.fetch_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
  total_batches_val bigint := 0;
  active_batches_val bigint := 0;
  total_bags_val bigint := 0;
  scanned_bags_val bigint := 0;
  total_collectors_val bigint := 0;
  active_collectors_val bigint := 0;
  total_pickups_val bigint := 0;
  pending_pickups_val bigint := 0;
  total_dumping_val bigint := 0;
  pending_dumping_val bigint := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='batches') THEN
    SELECT COUNT(*) INTO total_batches_val FROM public.batches;
    SELECT COUNT(*) INTO active_batches_val FROM public.batches WHERE status = 'active';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bags') THEN
    SELECT COUNT(*) INTO total_bags_val FROM public.bags;
    SELECT COUNT(*) INTO scanned_bags_val FROM public.bags WHERE scanned = true;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='collector_profiles') THEN
    SELECT COUNT(*) INTO total_collectors_val FROM public.collector_profiles;
    SELECT COUNT(*) INTO active_collectors_val FROM public.collector_profiles WHERE status = 'active';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pickup_requests') THEN
    SELECT COUNT(*) INTO total_pickups_val FROM public.pickup_requests;
    SELECT COUNT(*) INTO pending_pickups_val FROM public.pickup_requests WHERE status = 'available';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='illegal_dumping_mobile') THEN
    SELECT COUNT(*) INTO total_dumping_val FROM public.illegal_dumping_mobile;
    SELECT COUNT(*) INTO pending_dumping_val FROM public.illegal_dumping_mobile WHERE status = 'pending';
  END IF;

  result := jsonb_build_object(
    'total_batches', total_batches_val,
    'active_batches', active_batches_val,
    'total_bags', total_bags_val,
    'scanned_bags', scanned_bags_val,
    'total_collectors', total_collectors_val,
    'active_collectors', active_collectors_val,
    'total_pickups', total_pickups_val,
    'pending_pickups', pending_pickups_val,
    'total_dumping_reports', total_dumping_val,
    'pending_reports', pending_dumping_val
  );

  RETURN result;
END;
$function$;
