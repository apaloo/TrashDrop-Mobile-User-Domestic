-- Function public.td_point_text
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_point_text(r jsonb): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_point_text(r jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE g geometry;
BEGIN
  g := public.td_row_point(r);
  IF g IS NULL THEN RETURN NULL; END IF;
  RETURN round(ST_Y(g)::numeric, 5)::text || ', ' || round(ST_X(g)::numeric, 5)::text;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $function$;
