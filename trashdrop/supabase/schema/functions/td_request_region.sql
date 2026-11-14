-- Function public.td_request_region
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_request_region(p_table text, p_row jsonb): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_request_region(p_table text, p_row jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  g geometry;
  reg text := nullif(btrim(p_row ->> 'region'), '');
BEGIN
  IF reg IS NOT NULL THEN RETURN reg; END IF;
  IF p_table = 'digital_bins' AND (p_row ->> 'location_id') IS NOT NULL AND to_regclass('public.bin_locations') IS NOT NULL THEN
    SELECT public.td_report_point(to_jsonb(bl)) INTO g FROM public.bin_locations bl WHERE bl.id::text = p_row ->> 'location_id';
  END IF;
  g := coalesce(g, public.td_report_point(p_row));
  IF g IS NULL THEN RETURN NULL; END IF;
  SELECT a.region INTO reg FROM public.td_area_at(ST_Y(g), ST_X(g)) a;
  RETURN reg;
END $function$;
