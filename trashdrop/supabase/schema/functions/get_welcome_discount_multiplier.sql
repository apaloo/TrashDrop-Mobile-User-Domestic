-- Function public.get_welcome_discount_multiplier
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_welcome_discount_multiplier(p_user_id uuid): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_welcome_discount_multiplier(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_completed_count INTEGER;
BEGIN
  -- Get current completed requests count
  SELECT COALESCE(completed_requests_count, 0) INTO v_completed_count
  FROM public.user_stats
  WHERE user_id = p_user_id;
  
  -- If no record exists, user is new - eligible for discount
  IF v_completed_count IS NULL THEN
    v_completed_count := 0;
  END IF;
  
  -- Return 4.5% discount if under 5 completed requests
  IF v_completed_count < 5 THEN
    RETURN 0.045;
  ELSE
    RETURN 0;
  END IF;
END;
$function$;
