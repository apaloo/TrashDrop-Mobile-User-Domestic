-- Function public.td_report_scope
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_report_scope(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_report_scope()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r text := public.td_my_role();
  home jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('level', 'none', 'role', r); END IF;
  IF r IN ('admin', 'manager', 'media') THEN RETURN jsonb_build_object('level', 'national', 'role', r); END IF;
  IF r IN ('authority', 'volunteer') THEN RETURN public.td_my_area(); END IF;
  home := public.td_user_home_district();
  IF home IS NULL THEN RETURN jsonb_build_object('level', 'none', 'role', r); END IF;
  RETURN home || jsonb_build_object('level', 'district', 'role', r);
END $function$;
