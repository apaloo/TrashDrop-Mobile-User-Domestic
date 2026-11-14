-- Function public.update_collector_activity
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- update_collector_activity(p_user_id uuid): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.update_collector_activity(p_user_id uuid)
 RETURNS TABLE(is_online boolean, status text, last_active timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE collector_profiles
  SET 
    last_active = NOW(),
    is_online = true,
    status = 'active',
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING collector_profiles.is_online, collector_profiles.status, collector_profiles.last_active;
END;
$function$;
