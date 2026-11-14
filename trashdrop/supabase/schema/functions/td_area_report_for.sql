-- Function public.td_area_report_for
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_area_report_for(p_id uuid, p_action text): execute: service_role
CREATE OR REPLACE FUNCTION public.td_area_report_for(p_id uuid, p_action text)
 RETURNS illegal_dumping_mobile
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.illegal_dumping_mobile;
  role text := public.td_my_role();
  sc jsonb := public.td_report_scope();
BEGIN
  IF NOT public.can_do('dumping.' || p_action) THEN
    RAISE EXCEPTION 'Your account can''t do this on illegal dumping reports' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.illegal_dumping_mobile WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF NOT public.td_in_scope(sc, r.region, r.district) THEN
    RAISE EXCEPTION 'This report is outside your area' USING ERRCODE = '42501';
  END IF;
  RETURN r;
END $function$;
