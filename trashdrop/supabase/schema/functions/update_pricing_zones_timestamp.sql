-- Function public.update_pricing_zones_timestamp
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- update_pricing_zones_timestamp(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.update_pricing_zones_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
