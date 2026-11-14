-- Function public.extract_lon
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- extract_lon(loc text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.extract_lon(loc text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN (regexp_matches(loc, 'POINT\((-?[0-9.]+)\s+(-?[0-9.]+)\)'))[1]::numeric;
END;
$function$;
