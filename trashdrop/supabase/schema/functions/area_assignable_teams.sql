-- Function public.area_assignable_teams
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- area_assignable_teams(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.area_assignable_teams()
 RETURNS TABLE(id uuid, name text, collector_type text, region text, vehicle_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sc jsonb := public.td_report_scope();
  my_region text;
  my_role text := public.td_my_role();
BEGIN
  IF NOT public.can_do('dumping.assign') THEN
    RAISE EXCEPTION 'Your account can''t assign cleanups' USING ERRCODE = '42501';
  END IF;
  my_region := CASE WHEN sc ->> 'level' = 'national' THEN NULL ELSE sc ->> 'region' END;
  IF sc ->> 'level' <> 'national' AND my_region IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT cp.id::uuid,
         coalesce(nullif(btrim(concat_ws(' ', cp.first_name, cp.last_name)), ''), 'Unnamed team')::text,
         coalesce(to_jsonb(cp) ->> 'collector_type', 'collector')::text,
         public.td_collector_region(cp.id::text)::text,
         (to_jsonb(cp) ->> 'vehicle_type')::text
  FROM public.collector_profiles cp
  WHERE coalesce(cp.status, '') NOT IN ('suspended', 'inactive')
    AND (to_jsonb(cp) ->> 'deactivated_at') IS NULL
    AND (my_region IS NULL OR public.td_norm_region(public.td_collector_region(cp.id::text)) = public.td_norm_region(my_region))
    AND (my_role <> 'volunteer' OR coalesce(to_jsonb(cp) ->> 'collector_type', 'collector') = 'volunteer')
  ORDER BY 2;
END $function$;
