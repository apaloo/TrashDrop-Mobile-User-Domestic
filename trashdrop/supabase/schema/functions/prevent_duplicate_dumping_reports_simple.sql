-- Function public.prevent_duplicate_dumping_reports_simple
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- prevent_duplicate_dumping_reports_simple(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.prevent_duplicate_dumping_reports_simple()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    -- For now, just allow all reports to be created without duplicate checking
    -- This is a temporary measure to fix the immediate issue
    RETURN NEW;
END;
$function$;
