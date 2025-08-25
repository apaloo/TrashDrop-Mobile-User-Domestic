-- Migration: Fix Batch Activation to Set created_by Field
-- Updates the activate_batch_for_user function to set created_by when activating batches

-- Function to activate a batch atomically and set created_by
CREATE OR REPLACE FUNCTION public.activate_batch_for_user(
  p_batch_id uuid,
  p_user_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
AS $$
DECLARE
  v_batch record;
  v_result json;
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
  
  -- Update user stats by recalculating totals from all user's batches
  BEGIN
    INSERT INTO user_stats (user_id, total_batches, total_bags, created_at)
    SELECT 
      p_user_id as user_id,
      COUNT(*) as total_batches,
      SUM(COALESCE(bag_count, 0)) as total_bags,
      now() as created_at
    FROM batches
    WHERE created_by = p_user_id
    ON CONFLICT (user_id) DO UPDATE
    SET 
      total_batches = EXCLUDED.total_batches,
      total_bags = EXCLUDED.total_bags,
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    -- Log the error in a way that can be found in database logs
    RAISE WARNING 'Failed to update user_stats for user % and batch %: %', p_user_id, p_batch_id, SQLERRM;
    
    -- Add error info to the result
    v_result := json_build_object(
      'error', false, -- Still consider overall operation successful
      'activated', true,
      'stats_update_error', SQLERRM,
      'batch_id', v_batch.id,
      'user_stats_updated', false
    );
  END;
  
  -- Return success result
  RETURN json_build_object(
    'error', false,
    'activated', true,
    'batch_id', v_batch.id,
    'batch_number', v_batch.batch_number,
    'bag_count', v_batch.bag_count,
    'status', 'used',
    'activated_at', v_batch.updated_at,
    'created_at', v_batch.created_at,
    'created_by', v_batch.created_by
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.activate_batch_for_user(uuid, uuid) TO authenticated;
