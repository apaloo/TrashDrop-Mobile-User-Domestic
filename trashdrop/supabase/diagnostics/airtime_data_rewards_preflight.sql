-- Read-only checks before running 20261030000000_airtime_data_rewards.sql.
-- Changes nothing. Run in the Supabase SQL editor and keep the output.

-- Columns the migration uses (rewards: name, description, points_cost,
-- category, active; any other NOT NULL column without a default would stop
-- the insert)
SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name IN ('rewards', 'rewards_redemption')
 ORDER BY table_name, ordinal_position;

-- Rewards that will be hidden (active and not airtime/data)
SELECT id, name, points_cost, category, active FROM public.rewards ORDER BY points_cost;

-- Redemptions so far, by status (none are changed)
SELECT status, count(*), sum(points_spent) AS points FROM public.rewards_redemption GROUP BY status;
