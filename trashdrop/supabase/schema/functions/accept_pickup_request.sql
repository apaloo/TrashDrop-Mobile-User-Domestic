-- Function public.accept_pickup_request
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- accept_pickup_request(request_id text, collector_id uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.accept_pickup_request(request_id text, collector_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Check if request exists and is available
  IF NOT EXISTS (
    SELECT 1 FROM public.pickup_requests 
    WHERE id = request_id AND status = 'available'
  ) THEN
    RAISE EXCEPTION 'Request not found or not available';
    RETURN FALSE;
  END IF;
  
  -- Update request status
  UPDATE public.pickup_requests
  SET 
    status = 'accepted',
    collector_id = $2,
    accepted_at = now(),
    updated_at = now()
  WHERE id = $1;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
    RETURN FALSE;
END;
$function$;
