-- Migration: Populate user_stats table
-- This script populates the user_stats table with batch and bag data from the batches table

-- First create any missing user_stats entries based on batches data
INSERT INTO user_stats (user_id, total_batches, total_bags, updated_at)
SELECT 
  created_by as user_id,
  COUNT(*) as total_batches,
  SUM(COALESCE(bag_count, 0)) as total_bags,
  NOW() as updated_at
FROM batches
WHERE created_by IS NOT NULL
GROUP BY created_by
ON CONFLICT (user_id) DO UPDATE
SET 
  total_batches = EXCLUDED.total_batches,
  total_bags = EXCLUDED.total_bags,
  updated_at = EXCLUDED.updated_at;

-- Handle assigned batches if there's an assigned_to field
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'batches' AND column_name = 'assigned_to') THEN
    INSERT INTO user_stats (user_id, total_batches, total_bags, updated_at)
    SELECT 
      assigned_to as user_id,
      COUNT(*) as total_batches,
      SUM(COALESCE(bag_count, 0)) as total_bags,
      NOW() as updated_at
    FROM batches
    WHERE assigned_to IS NOT NULL 
    AND assigned_to != created_by -- Avoid double counting
    GROUP BY assigned_to
    ON CONFLICT (user_id) DO UPDATE
    SET 
      total_batches = user_stats.total_batches + EXCLUDED.total_batches,
      total_bags = user_stats.total_bags + EXCLUDED.total_bags,
      updated_at = EXCLUDED.updated_at;
  END IF;
END $$;

-- Log the results
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % user_stats records', updated_count;
END $$;
