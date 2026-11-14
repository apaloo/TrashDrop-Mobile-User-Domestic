-- Function public.extract_lat
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- extract_lat(loc text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.extract_lat(loc text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN (regexp_matches(loc, 'POINT\((-?[0-9.]+)\s+(-?[0-9.]+)\)'))[2]::numeric;
END;
$function$;
