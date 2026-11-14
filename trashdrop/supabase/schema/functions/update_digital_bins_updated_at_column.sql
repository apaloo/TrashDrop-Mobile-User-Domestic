-- Function public.update_digital_bins_updated_at_column
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- update_digital_bins_updated_at_column(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.update_digital_bins_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
