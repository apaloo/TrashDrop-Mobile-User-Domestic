-- Migration: Welcome Discount for New Users
-- Date: 2025-01-13
-- Purpose: Track completed requests to apply silent 4.5% discount on first 5 requests

-- Add completed_requests_count to user_stats table
ALTER TABLE IF EXISTS public.user_stats
ADD COLUMN IF NOT EXISTS completed_requests_count INTEGER NOT NULL DEFAULT 0;

-- Add constraint to ensure non-negative value
ALTER TABLE IF EXISTS public.user_stats
  DROP CONSTRAINT IF EXISTS chk_user_stats_completed_requests_non_negative;
ALTER TABLE IF EXISTS public.user_stats
  ADD CONSTRAINT chk_user_stats_completed_requests_non_negative CHECK (completed_requests_count >= 0);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_stats_completed_requests 
ON public.user_stats(user_id) 
WHERE completed_requests_count < 5;

-- Function to get welcome discount eligibility (returns discount multiplier)
-- Returns 0.045 (4.5%) if eligible, 0 if not
CREATE OR REPLACE FUNCTION public.get_welcome_discount_multiplier(p_user_id UUID)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_completed_count INTEGER;
BEGIN
  -- Get current completed requests count
  SELECT COALESCE(completed_requests_count, 0) INTO v_completed_count
  FROM public.user_stats
  WHERE user_id = p_user_id;
  
  -- If no record exists, user is new - eligible for discount
  IF v_completed_count IS NULL THEN
    v_completed_count := 0;
  END IF;
  
  -- Return 4.5% discount if under 5 completed requests
  IF v_completed_count < 5 THEN
    RETURN 0.045;
  ELSE
    RETURN 0;
  END IF;
END;
$$;

-- Function to increment completed requests count (called after pickup/digital bin completion)
CREATE OR REPLACE FUNCTION public.increment_completed_requests(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  -- Upsert: insert if not exists, increment if exists
  INSERT INTO public.user_stats (user_id, completed_requests_count)
  VALUES (p_user_id, 1)
  ON CONFLICT (user_id) 
  DO UPDATE SET completed_requests_count = public.user_stats.completed_requests_count + 1
  RETURNING completed_requests_count INTO v_new_count;
  
  RETURN v_new_count;
END;
$$;

-- Trigger function to auto-increment on digital_bins status change to 'collected'
CREATE OR REPLACE FUNCTION public.trigger_increment_on_digital_bin_collected()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only increment when status changes to 'collected'
  IF NEW.status = 'collected' AND (OLD.status IS NULL OR OLD.status != 'collected') THEN
    PERFORM public.increment_completed_requests(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function to auto-increment on pickup_requests status change to 'completed'
CREATE OR REPLACE FUNCTION public.trigger_increment_on_pickup_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only increment when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    PERFORM public.increment_completed_requests(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create triggers (drop first if exists to avoid duplicates)
DROP TRIGGER IF EXISTS trigger_digital_bin_collected ON public.digital_bins;
CREATE TRIGGER trigger_digital_bin_collected
  AFTER UPDATE ON public.digital_bins
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_increment_on_digital_bin_collected();

DROP TRIGGER IF EXISTS trigger_pickup_completed ON public.pickup_requests;
CREATE TRIGGER trigger_pickup_completed
  AFTER UPDATE ON public.pickup_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_increment_on_pickup_completed();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_welcome_discount_multiplier TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_completed_requests TO authenticated;

-- Add comment for documentation
COMMENT ON COLUMN public.user_stats.completed_requests_count IS 'Number of completed pickup/digital bin requests. Used internally for welcome discount (first 5 requests get 4.5% off base price).';

-- Rollback instructions
/*
DROP TRIGGER IF EXISTS trigger_digital_bin_collected ON public.digital_bins;
DROP TRIGGER IF EXISTS trigger_pickup_completed ON public.pickup_requests;
DROP FUNCTION IF EXISTS public.trigger_increment_on_pickup_completed();
DROP FUNCTION IF EXISTS public.trigger_increment_on_digital_bin_collected();
DROP FUNCTION IF EXISTS public.increment_completed_requests;
DROP FUNCTION IF EXISTS public.get_welcome_discount_multiplier;
DROP INDEX IF EXISTS idx_user_stats_completed_requests;
ALTER TABLE IF EXISTS public.user_stats DROP CONSTRAINT IF EXISTS chk_user_stats_completed_requests_non_negative;
ALTER TABLE IF EXISTS public.user_stats DROP COLUMN IF EXISTS completed_requests_count;
*/
