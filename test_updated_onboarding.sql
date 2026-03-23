-- Test the updated onboarding flow paths
-- Clear onboarding progress for test user
DELETE FROM user_activity 
WHERE user_id = '35bcf522-f61b-4774-b604-6056d22ed884';

-- Verify clean state
SELECT * FROM get_user_onboarding_state('35bcf522-f61b-4774-b604-6056d22ed884');

-- Test instructions:
-- 1. Visit http://localhost:3002/dashboard?force=true
-- 2. Should show: Welcome step with only "Yes, I have bags" and "No, I don't have bags" buttons
-- 3. Click "No, I don't have bags" 
-- 4. Should show: ChooseServiceStep with "Create Digital Bin" and "Report Illegal Dumping" (and disabled "Order for your Trashdrop bag")
-- 5. Test "Create Digital Bin" → should navigate to /my-bins
-- 6. Test "Report Illegal Dumping" → should navigate to /report
-- 7. Test "Yes, I have bags" → should go through Location → QR → Request Pickup flow
