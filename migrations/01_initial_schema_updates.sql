-- Migration: Initial Schema Updates for TrashDrop App
-- Adds frequency column to scheduled_pickups and updates type constraints

-- Add frequency column to scheduled_pickups table
ALTER TABLE IF EXISTS scheduled_pickups 
ADD COLUMN IF NOT EXISTS frequency VARCHAR(50) NOT NULL DEFAULT 'weekly';

-- Add check constraint for valid frequency values
ALTER TABLE scheduled_pickups 
ADD CONSTRAINT check_frequency CHECK (frequency IN ('weekly', 'biweekly', 'monthly'));

-- Update the bags.type column constraint
ALTER TABLE bags 
DROP CONSTRAINT IF EXISTS check_bag_type;

ALTER TABLE bags 
ADD CONSTRAINT check_bag_type CHECK (type IN ('general', 'recycling', 'organic'));

-- Add waste type constraint to dumping_reports
ALTER TABLE dumping_reports 
DROP CONSTRAINT IF EXISTS check_waste_type;

ALTER TABLE dumping_reports 
ADD CONSTRAINT check_waste_type CHECK (waste_type IN ('general', 'recycling', 'organic'));
