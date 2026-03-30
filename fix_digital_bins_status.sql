-- Fix digital_bins status column issue
-- This script will check for and fix any triggers or defaults that might be setting status to 'available'

-- First, let's see if there's a trigger setting status to 'available'
SELECT 
    trigger_name,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'digital_bins'
AND trigger_schema = 'public';

-- Check if there's a default value on the status column
SELECT 
    column_name, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'digital_bins' 
AND table_schema = 'public'
AND column_name = 'status';

-- If there's a trigger setting status to 'available', drop it
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'set_digital_bins_status_available' 
        AND event_object_table = 'digital_bins'
        AND trigger_schema = 'public'
    ) THEN
        DROP TRIGGER set_digital_bins_status_available ON digital_bins;
        RAISE NOTICE 'Dropped trigger setting status to available';
    END IF;
END $$;

-- Update any existing records with status 'available' to 'pending'
UPDATE digital_bins 
SET status = 'pending' 
WHERE status = 'available';

-- Add a proper default if needed
ALTER TABLE digital_bins 
ALTER COLUMN status SET DEFAULT 'pending';

-- Add constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'digital_bins_status_check'
    ) THEN
        ALTER TABLE digital_bins 
        ADD CONSTRAINT digital_bins_status_check 
        CHECK (status IN ('pending', 'accepted', 'en_route', 'arrived', 'collecting', 'completed', 'cancelled'));
    END IF;
END $$;
