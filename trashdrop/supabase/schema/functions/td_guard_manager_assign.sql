-- Function public.td_guard_manager_assign
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_guard_manager_assign(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_guard_manager_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_collector text := to_jsonb(NEW) ->> 'collector_id';
  old_collector text;
  mine text;
  req_region text;
  col_region text;
BEGIN
  IF auth.uid() IS NULL OR new_collector IS NULL OR public.td_is_staff()
     OR public.td_my_role() IS DISTINCT FROM 'manager' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    old_collector := to_jsonb(OLD) ->> 'collector_id';
    IF old_collector IS NOT DISTINCT FROM new_collector THEN RETURN NEW; END IF;
  END IF;

  mine := public.td_my_assign_region();
  IF mine IS NULL THEN
    RAISE EXCEPTION 'Only Waste Management managers with a region can assign collectors. Ask an admin to set your account type and region.'
      USING ERRCODE = '42501';
  END IF;

  req_region := public.td_request_region(TG_TABLE_NAME, to_jsonb(NEW));
  IF public.td_norm_region(req_region) IS DISTINCT FROM public.td_norm_region(mine) THEN
    RAISE EXCEPTION 'This request is in % region. You can only assign requests in % region.',
      coalesce(req_region, 'an unknown'), mine USING ERRCODE = '42501';
  END IF;

  col_region := public.td_collector_region(new_collector);
  IF public.td_norm_region(col_region) IS DISTINCT FROM public.td_norm_region(mine) THEN
    RAISE EXCEPTION 'This collector works in % region. Choose a collector in % region.',
      coalesce(col_region, 'no'), mine USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;
