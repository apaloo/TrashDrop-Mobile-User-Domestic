-- Function public.backfill_bag_user_ids
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- backfill_bag_user_ids(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.backfill_bag_user_ids()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_affected_rows integer;
BEGIN
  -- Update bags that don't have user_id but their batch has a created_by (user)
  UPDATE bags b
  SET user_id = bt.created_by,
      updated_at = now()
  FROM batches bt
  WHERE b.batch_id = bt.id
    AND b.user_id IS NULL
    AND bt.created_by IS NOT NULL
    AND bt.status = 'used';
  
  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'bags_updated', v_affected_rows,
    'message', format('Updated %s bags with user_id from batch ownership', v_affected_rows)
  );
END;
$function$;
