-- Migration: Assign bags to user when batch is activated
-- This ensures bags table has user_id populated for collector app integration

-- Drop existing function first
DROP FUNCTION IF EXISTS public.activate_batch_for_user(uuid, uuid);

-- Create updated batch activation function that assigns bags to user
CREATE OR REPLACE FUNCTION public.activate_batch_for_user(
  p_batch_id uuid,
  p_user_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch record;
  v_result json;
  v_bags_updated integer;
BEGIN
  -- Get and update batch in one operation
  UPDATE batches 
  SET status = 'used',
      created_by = p_user_id,
      updated_at = now()
  WHERE id = p_batch_id
    AND status = 'active'
  RETURNING * INTO v_batch;
  
  -- Check if batch was found and updated
  IF NOT FOUND THEN
    -- Try to get batch info for better error message
    SELECT * INTO v_batch FROM batches WHERE id = p_batch_id;
    
    IF NOT FOUND THEN
      RETURN json_build_object(
        'error', true,
        'message', 'Batch not found',
        'code', 'BATCH_NOT_FOUND'
      );
    ELSE
      RETURN json_build_object(
        'error', true,
        'message', 'Batch is not active',
        'code', 'BATCH_NOT_ACTIVE',
        'current_status', v_batch.status
      );
    END IF;
  END IF;
  
  -- Assign bags from this batch to the user
  -- This links bags to users for pickup request coupling
  BEGIN
    UPDATE bags 
    SET user_id = p_user_id,
        updated_at = now()
    WHERE batch_id = p_batch_id
      AND (user_id IS NULL OR user_id != p_user_id);
    
    GET DIAGNOSTICS v_bags_updated = ROW_COUNT;
    
    RAISE NOTICE 'Assigned % bags from batch % to user %', v_bags_updated, p_batch_id, p_user_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to assign bags to user %: %', p_user_id, SQLERRM;
    -- Non-fatal - continue even if bag assignment fails
    v_bags_updated := 0;
  END;
  
  -- Recalculate user stats from all user's batches
  BEGIN
    INSERT INTO user_stats (user_id, total_batches, total_bags, created_at)
    SELECT 
      p_user_id as user_id,
      COUNT(*) as total_batches,
      SUM(COALESCE(bag_count, 0)) as total_bags,
      now() as created_at
    FROM batches
    WHERE created_by = p_user_id
      AND status = 'used'
    ON CONFLICT (user_id) DO UPDATE
    SET 
      total_batches = EXCLUDED.total_batches,
      total_bags = EXCLUDED.total_bags,
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to update user_stats for user %: %', p_user_id, SQLERRM;
  END;
  
  -- Return success result
  RETURN json_build_object(
    'error', false,
    'activated', true,
    'batch_id', v_batch.id,
    'batch_number', v_batch.batch_number,
    'bag_count', v_batch.bag_count,
    'bags_assigned', v_bags_updated,
    'status', 'used',
    'activated_at', v_batch.updated_at,
    'created_at', v_batch.created_at,
    'created_by', v_batch.created_by
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.activate_batch_for_user(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.activate_batch_for_user IS 
'Activates a batch for a user, assigns bags to the user for pickup linking, and updates user stats.';

-- Also create a function to backfill user_id for existing bags based on batch ownership
CREATE OR REPLACE FUNCTION public.backfill_bag_user_ids()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.backfill_bag_user_ids() TO authenticated;

COMMENT ON FUNCTION public.backfill_bag_user_ids IS 
'Backfills user_id for bags based on their batch created_by field. Run this to fix existing data.';
