-- Migration: Add bin size and urgent priority to digital_bins
-- Date: 2025-01-20
-- Purpose: Enable cost calculation based on bin size and request prioritization

-- Add bin_size_liters column to digital_bins table
ALTER TABLE public.digital_bins 
ADD COLUMN IF NOT EXISTS bin_size_liters INTEGER NOT NULL DEFAULT 120;

-- Add is_urgent column to digital_bins table
ALTER TABLE public.digital_bins 
ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false;

-- Add constraint to validate bin sizes (only allow specific sizes)
ALTER TABLE public.digital_bins 
ADD CONSTRAINT check_bin_size 
CHECK (bin_size_liters IN (60, 80, 90, 100, 120, 240, 340, 360, 660, 1100));

-- Create index for bin size queries (useful for reporting/analytics)
CREATE INDEX IF NOT EXISTS idx_digital_bins_bin_size 
ON public.digital_bins(bin_size_liters);

-- Create partial index for urgent bins (for priority queue processing)
-- Partial indexes are more efficient as they only index rows where is_urgent = true
CREATE INDEX IF NOT EXISTS idx_digital_bins_urgent 
ON public.digital_bins(is_urgent, created_at) 
WHERE is_urgent = true;

-- Add helpful comments for documentation
COMMENT ON COLUMN public.digital_bins.bin_size_liters IS 
'Size of the waste bin in liters. Valid sizes: 60, 80, 90, 100, 120, 240, 340, 360, 660, 1100. Default is 120L (standard household size). Bin size determines the collection cost.';

COMMENT ON COLUMN public.digital_bins.is_urgent IS 
'Flag to indicate if this bin request should be prioritized for collection. Urgent requests are processed first and may incur an additional fee (typically +10%).';

-- Update existing records to have bin_size_liters = 120 (already done by DEFAULT, but explicit for clarity)
-- This ensures backward compatibility with existing digital bins
UPDATE public.digital_bins 
SET bin_size_liters = 120 
WHERE bin_size_liters IS NULL;

-- No need to update is_urgent as DEFAULT false already handles it

-- Optional: Create a view for urgent bins (useful for operations dashboard)
CREATE OR REPLACE VIEW public.urgent_digital_bins AS
SELECT 
  db.id,
  db.user_id,
  db.location_id,
  db.bin_size_liters,
  db.waste_type,
  db.frequency,
  db.is_urgent,
  db.created_at,
  db.expires_at,
  bl.location_name,
  bl.address
FROM public.digital_bins db
JOIN public.bin_locations bl ON db.location_id = bl.id
WHERE db.is_urgent = true 
  AND db.is_active = true
  AND db.expires_at > NOW()
ORDER BY db.created_at ASC;

-- Grant access to the view (same permissions as digital_bins table)
ALTER VIEW public.urgent_digital_bins OWNER TO postgres;

COMMENT ON VIEW public.urgent_digital_bins IS 
'View showing all active urgent digital bin requests, ordered by creation time for priority processing.';

-- Rollback instructions (commented out, use if needed to undo this migration):
/*
-- Drop the view
DROP VIEW IF EXISTS public.urgent_digital_bins;

-- Remove indexes
DROP INDEX IF EXISTS idx_digital_bins_urgent;
DROP INDEX IF EXISTS idx_digital_bins_bin_size;

-- Remove constraint
ALTER TABLE public.digital_bins DROP CONSTRAINT IF EXISTS check_bin_size;

-- Remove columns (WARNING: This will delete data!)
ALTER TABLE public.digital_bins DROP COLUMN IF EXISTS is_urgent;
ALTER TABLE public.digital_bins DROP COLUMN IF EXISTS bin_size_liters;
*/
