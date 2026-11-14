-- Function public.update_collector_profiles_updated_at
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- update_collector_profiles_updated_at(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.update_collector_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;
