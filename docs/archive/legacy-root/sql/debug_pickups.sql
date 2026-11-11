-- Check all active pickups for the user
-- Run this in your Supabase SQL Editor

SELECT 
  id,
  status,
  bag_count,
  created_at,
  location
FROM pickup_requests
WHERE user_id = 'ffca6594-0657-4eec-b473-3006630bdaef'
  AND status IN ('available', 'pending', 'scheduled', 'accepted', 'in_transit')
ORDER BY created_at DESC;

-- Get the total count
SELECT 
  status,
  COUNT(*) as count,
  SUM(bag_count) as total_bags
FROM pickup_requests
WHERE user_id = 'ffca6594-0657-4eec-b473-3006630bdaef'
  AND status IN ('available', 'pending', 'scheduled', 'accepted', 'in_transit')
GROUP BY status;
