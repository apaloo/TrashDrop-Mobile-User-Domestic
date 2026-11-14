-- Function public.refresh_all_user_stats
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- refresh_all_user_stats(): execute: service_role
CREATE OR REPLACE FUNCTION public.refresh_all_user_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_affected_rows integer;
BEGIN
  -- This will populate stats for all users based on their batches
  INSERT INTO user_stats (user_id, total_batches, total_bags, created_at)
  SELECT 
    created_by as user_id,
    COUNT(*) as total_batches,
    SUM(COALESCE(bag_count, 0)) as total_bags,
    NOW() as created_at
  FROM batches
  WHERE created_by IS NOT NULL
  GROUP BY created_by
  ON CONFLICT (user_id) DO UPDATE
  SET 
    total_batches = EXCLUDED.total_batches,
    total_bags = EXCLUDED.total_bags,
    created_at = EXCLUDED.created_at;
  
  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'affected_users', v_affected_rows,
    'updated_at', NOW()
  );
END;
$function$;
