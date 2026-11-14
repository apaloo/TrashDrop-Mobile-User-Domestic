-- Function public.td_report_point
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_report_point(r jsonb): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_report_point(r jsonb)
 RETURNS geometry
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  num constant text := '^\s*-?[0-9]+(\.[0-9]+)?\s*$';
  lat double precision;
  lng double precision;
  g geometry;
BEGIN
  IF r IS NULL THEN RETURN NULL; END IF;
  IF (r ->> 'latitude') ~ num AND (r ->> 'longitude') ~ num THEN
    lat := btrim(r ->> 'latitude')::double precision;
    lng := btrim(r ->> 'longitude')::double precision;
  ELSE
    g := public.td_row_point(r);
    IF g IS NULL THEN RETURN NULL; END IF;
    lat := ST_Y(g);
    lng := ST_X(g);
  END IF;
  IF lat BETWEEN -3.5 AND 1.5 AND lng BETWEEN 4.5 AND 11.5 THEN
    RETURN ST_SetSRID(ST_MakePoint(lat, lng), 4326);
  END IF;
  RETURN ST_SetSRID(ST_MakePoint(lng, lat), 4326);
END $function$;
