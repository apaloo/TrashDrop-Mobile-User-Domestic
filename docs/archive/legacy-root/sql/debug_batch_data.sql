-- Debug query to understand the batch data structure
-- Check what's actually in the batches table for this user

SELECT 
  'Raw batches table data' as info,
  id,
  batch_number,
  bag_count,
  created_by,
  status,
  created_at,
  updated_at
FROM batches 
WHERE created_by = '15df32cb-8401-4f5f-8ed0-5c34c0a993d0'
ORDER BY created_at DESC;

-- Also check the current view results
SELECT 
  'Current dashboard view data' as info,
  user_id,
  email,
  batches,
  total_bags,
  available_bags
FROM user_stats_dashboard 
WHERE user_id = '15df32cb-8401-4f5f-8ed0-5c34c0a993d0';

-- Check the batch counting subquery directly
SELECT 
  'Batch counting subquery' as info,
  created_by as user_id,
  COUNT(DISTINCT id) as batch_count,
  SUM(bag_count) as total_bags,
  COUNT(*) as total_rows,
  MAX(updated_at) as last_batch
FROM batches 
WHERE created_by = '15df32cb-8401-4f5f-8ed0-5c34c0a993d0'
GROUP BY created_by;
