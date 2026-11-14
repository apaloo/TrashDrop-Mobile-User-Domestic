-- Function public.update_pickup_request_timestamp
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- update_pickup_request_timestamp(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.update_pickup_request_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
