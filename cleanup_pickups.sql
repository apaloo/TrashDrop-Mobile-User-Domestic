-- OPTION 1: Cancel all old "available" pickups older than 1 day
-- This assumes pickups in "available" status for more than 1 day are stale

UPDATE pickup_requests
SET status = 'cancelled'
WHERE user_id = 'ffca6594-0657-4eec-b473-3006630bdaef'
  AND status = 'available'
  AND created_at < NOW() - INTERVAL '1 day';

-- OPTION 2: Cancel ALL active pickups (use for testing/cleanup)
-- WARNING: This will cancel ALL your active pickups!

UPDATE pickup_requests
SET status = 'cancelled'
WHERE user_id = 'ffca6594-0657-4eec-b473-3006630bdaef'
  AND status IN ('available', 'pending', 'scheduled', 'accepted', 'in_transit');

-- OPTION 3: Mark old pickups as completed
-- This assumes they were actually picked up but not marked

UPDATE pickup_requests
SET status = 'completed',
    picked_up_at = NOW(),
    disposed_at = NOW()
WHERE user_id = 'ffca6594-0657-4eec-b473-3006630bdaef'
  AND status IN ('available', 'pending', 'scheduled', 'accepted', 'in_transit')
  AND created_at < NOW() - INTERVAL '1 day';

-- OPTION 4: Keep only the most recent pickup, cancel the rest

WITH recent_pickup AS (
  SELECT id
  FROM pickup_requests
  WHERE user_id = 'ffca6594-0657-4eec-b473-3006630bdaef'
    AND status IN ('available', 'pending', 'scheduled', 'accepted', 'in_transit')
  ORDER BY created_at DESC
  LIMIT 1
)
UPDATE pickup_requests
SET status = 'cancelled'
WHERE user_id = 'ffca6594-0657-4eec-b473-3006630bdaef'
  AND status IN ('available', 'pending', 'scheduled', 'accepted', 'in_transit')
  AND id NOT IN (SELECT id FROM recent_pickup);

-- Verify the changes
SELECT 
  status,
  COUNT(*) as count,
  SUM(bag_count) as total_bags
FROM pickup_requests
WHERE user_id = 'ffca6594-0657-4eec-b473-3006630bdaef'
GROUP BY status
ORDER BY status;
