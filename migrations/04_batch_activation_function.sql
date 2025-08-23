-- Migration: Batch Activation Function
-- Creates a function that can update batch status bypassing RLS issues

-- Function to activate a batch atomically
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
  
  -- Update user stats if user_stats table exists
  BEGIN
    INSERT INTO user_stats (user_id, total_bags, total_batches, updated_at)
    VALUES (p_user_id, COALESCE(v_batch.bag_count, 0), 1, now())
    ON CONFLICT (user_id) DO UPDATE
    SET total_bags = COALESCE(user_stats.total_bags, 0) + COALESCE(v_batch.bag_count, 0),
        total_batches = COALESCE(user_stats.total_batches, 0) + 1,
        updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    -- User stats update failed, but batch was activated successfully
    NULL;
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
    'created_at', v_batch.created_at
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.activate_batch_for_user(uuid, uuid) TO authenticated;
