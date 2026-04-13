-- Migration: Clean up orphan bags without user_id
-- These were created before the fix and are duplicates

-- First, verify what will be deleted
SELECT batch_id, COUNT(*) as orphan_count
FROM bags 
WHERE user_id IS NULL 
GROUP BY batch_id
ORDER BY orphan_count DESC;

-- Delete orphan bags (no user_id means not linked to any user, can't be used)
DELETE FROM bags 
WHERE user_id IS NULL;

-- Return count of deleted rows
-- (Check output to see how many were removed)
