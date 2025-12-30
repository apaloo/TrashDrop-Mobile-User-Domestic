-- Migration: Add total_bags to user_stats and backfill
-- Safely add the column with a default and not null constraint
ALTER TABLE IF EXISTS user_stats
ADD COLUMN IF NOT EXISTS total_bags integer NOT NULL DEFAULT 0;

-- Backfill strategy:
-- If total_bags_scanned exists, initialize total_bags from it where appropriate.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_stats'
      AND column_name = 'total_bags_scanned'
  ) THEN
    -- Initialize total_bags from total_bags_scanned when total_bags looks uninitialized
    UPDATE public.user_stats
    SET total_bags = COALESCE(total_bags_scanned, 0)
    WHERE COALESCE(total_bags, 0) = 0;
  END IF;
END $$;

-- Optional: ensure total_bags stays non-negative
ALTER TABLE IF EXISTS user_stats
  DROP CONSTRAINT IF EXISTS chk_user_stats_total_bags_non_negative;
ALTER TABLE IF EXISTS user_stats
  ADD CONSTRAINT chk_user_stats_total_bags_non_negative CHECK (total_bags >= 0);
