-- Function public.td_scan_location
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_scan_location(j jsonb): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_scan_location(j jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE g geometry;
BEGIN
  BEGIN g := public.td_row_point(j); EXCEPTION WHEN OTHERS THEN g := NULL; END;
  IF g IS NOT NULL THEN
    RETURN round(ST_Y(g)::numeric, 5)::text || ', ' || round(ST_X(g)::numeric, 5)::text;
  END IF;
  RETURN nullif(btrim(coalesce(j ->> 'location_name', j ->> 'address',
    CASE WHEN jsonb_typeof(j -> 'location') = 'string' AND j ->> 'location' !~ '^(SRID=|0101|POINT)' THEN j ->> 'location' END)), '');
END $function$;
