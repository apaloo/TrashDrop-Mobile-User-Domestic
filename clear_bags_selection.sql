-- Complete reset of bags selection for testing "no bags" path

-- Step 1: Remove ALL bags-related activities
DELETE FROM user_activity 
WHERE user_id = '35bcf522-f61b-4774-b604-6056d22ed884' 
AND activity_type IN ('has_bags_true', 'has_bags_false', 'bags_selection');

-- Step 2: Also clear any onboarding completion to force fresh start
DELETE FROM user_activity 
WHERE user_id = '35bcf522-f61b-4774-b604-6056d22ed884' 
AND activity_type = 'onboarding_completed';

-- Step 3: Verify what remains (should show locations and QR scans but NO bags selection)
SELECT 
    activity_type,
    created_at,
    COUNT(*) as count
FROM user_activity 
WHERE user_id = '35bcf522-f61b-4774-b604-6056d22ed884'
GROUP BY activity_type
ORDER BY activity_type;

-- Step 4: Check the current state
SELECT * FROM get_user_onboarding_state('35bcf522-f61b-4774-b604-6056d22ed884');

-- Step 5: Check bags selection (should show selection_made: false)
SELECT * FROM get_user_has_bags_selection('35bcf522-f61b-4774-b604-6056d22ed884');
