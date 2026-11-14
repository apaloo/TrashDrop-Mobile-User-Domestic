-- Function public.dispose_bags
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- dispose_bags(request_id text, collector_id uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.dispose_bags(request_id text, collector_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  fee_amount INTEGER;
BEGIN
  -- Check if request exists and is picked up by this collector
  IF NOT EXISTS (
    SELECT 1 FROM public.pickup_requests 
    WHERE id = request_id AND status = 'picked_up' AND collector_id = $2
  ) THEN
    RAISE EXCEPTION 'Request not found or not picked up by this collector';
    RETURN FALSE;
  END IF;
  
  -- Get fee amount
  SELECT fee INTO fee_amount FROM public.pickup_requests WHERE id = $1;
  
  -- Update request status
  UPDATE public.pickup_requests
  SET 
    status = 'disposed',
    disposed_at = now(),
    updated_at = now()
  WHERE id = $1;
  
  -- Add fee points
  INSERT INTO public.fee_points (user_id, points, request_id)
  VALUES ($2, fee_amount, $1);
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
    RETURN FALSE;
END;
$function$;
