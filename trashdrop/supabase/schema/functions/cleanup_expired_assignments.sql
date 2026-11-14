-- Function public.cleanup_expired_assignments
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- cleanup_expired_assignments(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.cleanup_expired_assignments()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  UPDATE pickup_requests
  SET status = 'available',
      collector_id = NULL,
      accepted_at = NULL
  WHERE status = 'accepted'
  AND accepted_at < (NOW() - INTERVAL '24 hours');
END;
$function$;
