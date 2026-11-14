-- Function public.increment_completed_requests
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- increment_completed_requests(p_user_id uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.increment_completed_requests(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_new_count INTEGER;
BEGIN
  -- Upsert: insert if not exists, increment if exists
  INSERT INTO public.user_stats (user_id, completed_requests_count)
  VALUES (p_user_id, 1)
  ON CONFLICT (user_id) 
  DO UPDATE SET completed_requests_count = public.user_stats.completed_requests_count + 1
  RETURNING completed_requests_count INTO v_new_count;
  
  RETURN v_new_count;
END;
$function$;
