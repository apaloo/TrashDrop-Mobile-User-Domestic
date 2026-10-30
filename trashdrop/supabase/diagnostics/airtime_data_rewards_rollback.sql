-- Undo supabase/migrations/20261030000000_airtime_data_rewards.sql
--
-- 1. Rewards go back to how they were (active flags from the backup).
-- 2. The airtime/data rewards it added are removed, or hidden if someone has
--    already redeemed one (their redemptions keep pointing at them).
-- 3. user_stats_dashboard goes back to 20261025000000 (counts every
--    redemption as spent): re-run that migration file after this one.
-- The new rewards_redemption columns are kept (phone numbers staff may still
-- need); drop them by hand if wanted. The backup table is kept.
-- One transaction.

BEGIN;
SET LOCAL search_path = public;

UPDATE public.rewards r
   SET active = b.active
  FROM public.rewards_backup_20261030 b
 WHERE b.id = r.id;

DELETE FROM public.rewards r
 WHERE r.category IN ('airtime', 'data')
   AND NOT EXISTS (SELECT 1 FROM public.rewards_backup_20261030 b WHERE b.id = r.id)
   AND NOT EXISTS (SELECT 1 FROM public.rewards_redemption x WHERE x.reward_id = r.id);

UPDATE public.rewards r
   SET active = false
 WHERE r.category IN ('airtime', 'data')
   AND NOT EXISTS (SELECT 1 FROM public.rewards_backup_20261030 b WHERE b.id = r.id);

COMMIT;

-- Then: supabase/migrations/20261025000000_dashboard_stats_without_profile.sql
