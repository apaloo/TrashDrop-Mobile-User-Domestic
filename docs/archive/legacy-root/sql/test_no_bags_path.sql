-- Test script to simulate "no bags" path for onboarding
-- This removes bags selection while keeping locations intact

-- Remove bags selection activities for test user
DELETE FROM user_activity 
WHERE user_id = '35bcf522-f61b-4774-b604-6056d22ed884' 
AND activity_type IN ('has_bags_true', 'has_bags_false');

-- Keep location activities intact
-- Keep QR scan activities intact (batches)
-- This creates a user with locations + QR scans but NO bags selection

-- Verify the state after cleanup
SELECT 
    activity_type,
    created_at,
    COUNT(*) as count
FROM user_activity 
WHERE user_id = '35bcf522-f61b-4774-b604-6056d22ed884'
GROUP BY activity_type, created_at
ORDER BY created_at DESC;

-- Check current onboarding state
SELECT * FROM get_user_onboarding_state('35bcf522-f61b-4774-b604-6056d22ed884');

-- Check bags selection (should return null/false)
SELECT * FROM get_user_has_bags_selection('35bcf522-f61b-4774-b604-6056d22ed884');
