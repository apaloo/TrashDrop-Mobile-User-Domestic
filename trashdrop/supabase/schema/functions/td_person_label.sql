-- Function public.td_person_label
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_person_label(p_ref text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_person_label(p_ref text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r text;
BEGIN
  IF p_ref IS NULL OR NOT public.td_is_staff() THEN RETURN NULL; END IF;
  SELECT nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), '') INTO r
  FROM public.collector_profiles c WHERE c.id::text = p_ref OR c.user_id::text = p_ref LIMIT 1;
  IF r IS NULL AND p_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    r := public.td_user_label(p_ref::uuid);
  END IF;
  RETURN coalesce(r, left(p_ref, 8));
END $function$;
