-- Function public.td_row_point
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_row_point(r jsonb): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_row_point(r jsonb)
 RETURNS geometry
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  k text;
  v jsonb;
  g geometry;
BEGIN
  IF r IS NULL THEN RETURN NULL; END IF;
  FOREACH k IN ARRAY ARRAY['coordinates', 'location', 'current_location'] LOOP
    v := r -> k;
    CONTINUE WHEN v IS NULL OR v = 'null'::jsonb;
    BEGIN
      IF jsonb_typeof(v) = 'object' THEN
        g := ST_GeomFromGeoJSON(v::text);
      ELSIF jsonb_typeof(v) = 'string' THEN
        g := (v #>> '{}')::geometry;
      END IF;
      IF g IS NOT NULL AND GeometryType(g) = 'POINT' THEN RETURN g; END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- not a point; try the next field
    END;
  END LOOP;
  BEGIN
    IF r ? 'latitude' AND r ? 'longitude' THEN
      RETURN ST_SetSRID(ST_MakePoint((r ->> 'longitude')::double precision, (r ->> 'latitude')::double precision), 4326);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN NULL;
END;
$function$;
