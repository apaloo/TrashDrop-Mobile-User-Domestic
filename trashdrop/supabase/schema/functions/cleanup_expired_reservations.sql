-- Function public.cleanup_expired_reservations
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- cleanup_expired_reservations(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  UPDATE pickup_requests
  SET reserved_by = NULL,
      reservation_expires_at = NULL
  WHERE reservation_expires_at < NOW();
END;
$function$;
