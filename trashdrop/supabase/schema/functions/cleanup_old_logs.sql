-- Function public.cleanup_old_logs
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- cleanup_old_logs(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    -- Delete logs older than 30 days (except errors and critical)
    DELETE FROM public.logs 
    WHERE created_at < NOW() - INTERVAL '30 days' 
    AND level NOT IN ('error', 'critical');
    
    -- Delete error logs older than 90 days
    DELETE FROM public.logs 
    WHERE created_at < NOW() - INTERVAL '90 days' 
    AND level IN ('error', 'critical');
    
    RAISE NOTICE 'Old logs cleaned up successfully';
END;
$function$;
