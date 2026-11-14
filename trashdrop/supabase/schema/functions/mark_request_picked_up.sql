-- Function public.mark_request_picked_up
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- mark_request_picked_up(request_id text, collector_id uuid, scanned_bags text[]): execute: service_role
CREATE OR REPLACE FUNCTION public.mark_request_picked_up(request_id text, collector_id uuid, scanned_bags text[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Check if request exists and is accepted by this collector
  IF NOT EXISTS (
    SELECT 1 FROM public.pickup_requests 
    WHERE id = request_id AND status = 'accepted' AND collector_id = $2
  ) THEN
    RAISE EXCEPTION 'Request not found or not accepted by this collector';
    RETURN FALSE;
  END IF;
  
  -- Update request status
  UPDATE public.pickup_requests
  SET 
    status = 'picked_up',
    picked_up_at = now(),
    updated_at = now()
  WHERE id = $1;
  
  -- Update scanned bags
  UPDATE public.bags
  SET 
    scanned = TRUE,
    scanned_at = now()
  WHERE id = ANY($3) AND request_id = $1;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
    RETURN FALSE;
END;
$function$;
