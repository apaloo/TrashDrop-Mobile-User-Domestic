-- Migration: Create actual bag records when batch is activated
-- This ensures bags table has records for pickup linking

-- Drop existing function first
DROP FUNCTION IF EXISTS public.activate_batch_for_user(uuid, uuid);

-- Create updated batch activation function that creates bags
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
  v_bags_created integer := 0;
  v_bag_id uuid;
  i integer;
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
  
  -- Create actual bag records for this batch
  -- This provides the bags needed for pickup linking
  BEGIN
    FOR i IN 1..COALESCE(v_batch.bag_count, 0) LOOP
      INSERT INTO bags (
        batch_id,
        user_id,
        qr_code,
        status,
        created_at,
        updated_at
      ) VALUES (
        p_batch_id,
        p_user_id,
        'BAG-' || p_batch_id::text || '-' || i || '-' || floor(random() * 1000000)::int,
        'active',
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_bag_id;
      
      IF v_bag_id IS NOT NULL THEN
        v_bags_created := v_bags_created + 1;
      END IF;
    END LOOP;
    
    RAISE NOTICE 'Created % bags for batch % for user %', v_bags_created, p_batch_id, p_user_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create bags for user %: %', p_user_id, SQLERRM;
    -- Non-fatal - continue even if bag creation fails
    v_bags_created := 0;
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
    'bags_created', v_bags_created,
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
'Activates a batch for a user, creates individual bag records for pickup linking, and updates user stats.';

-- Also create a function to backfill bags for existing used batches
CREATE OR REPLACE FUNCTION public.backfill_bags_for_used_batches()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch record;
  v_bags_created integer := 0;
  v_total_batches integer := 0;
  v_bag_id uuid;
  i integer;
BEGIN
  -- Find all used batches that don't have corresponding bags
  FOR v_batch IN 
    SELECT b.id, b.created_by, b.bag_count
    FROM batches b
    WHERE b.status = 'used'
      AND b.created_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM bags WHERE batch_id = b.id
      )
  LOOP
    v_total_batches := v_total_batches + 1;
    
    -- Create bags for this batch
    FOR i IN 1..COALESCE(v_batch.bag_count, 0) LOOP
      INSERT INTO bags (
        batch_id,
        user_id,
        qr_code,
        status,
        created_at,
        updated_at
      ) VALUES (
        v_batch.id,
        v_batch.created_by,
        'BAG-' || v_batch.id::text || '-' || i || '-' || floor(random() * 1000000)::int,
        'active',
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_bag_id;
      
      IF v_bag_id IS NOT NULL THEN
        v_bags_created := v_bags_created + 1;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'batches_processed', v_total_batches,
    'bags_created', v_bags_created,
    'message', format('Processed %s batches, created %s bag records', v_total_batches, v_bags_created)
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.backfill_bags_for_used_batches() TO authenticated;

COMMENT ON FUNCTION public.backfill_bags_for_used_batches IS 
'Backfills bag records for all used batches that dont have bags. Run this to fix existing data.';
