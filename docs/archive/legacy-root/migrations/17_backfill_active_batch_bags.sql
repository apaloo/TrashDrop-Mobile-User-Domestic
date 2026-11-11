-- Migration: Backfill bags for active batches that have created_by set
-- These batches were activated but bags weren't created due to previous function version

CREATE OR REPLACE FUNCTION public.backfill_bags_for_active_batches()
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
  -- Find all active batches that have created_by (user) but no bags
  FOR v_batch IN 
    SELECT b.id, b.created_by, b.bag_count
    FROM batches b
    WHERE b.status = 'active'
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
    'message', format('Processed %s active batches, created %s bag records', v_total_batches, v_bags_created)
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.backfill_bags_for_active_batches() TO authenticated;

COMMENT ON FUNCTION public.backfill_bags_for_active_batches IS 
'Creates bag records for active batches that have created_by set but no bags yet.';

-- Run it immediately
SELECT * FROM backfill_bags_for_active_batches();
