-- Function public.set_dumping_location_hash_simple
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- set_dumping_location_hash_simple(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.set_dumping_location_hash_simple()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    -- Simply return NEW without any complex processing
    RETURN NEW;
END;
$function$;
