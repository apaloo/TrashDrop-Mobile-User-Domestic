-- Fix Reports Stats in Materialized View
-- Add missing total_reports field to user_stats_aggregated materialized view

-- Drop and recreate the materialized view with total_reports field
DROP MATERIALIZED VIEW IF EXISTS user_stats_aggregated;

CREATE MATERIALIZED VIEW IF NOT EXISTS user_stats_aggregated AS
SELECT 
  user_id,
  total_pickups,
  total_points,
  total_bags,
  total_batches,
  total_reports,
  last_activity_at,
  computed_at
FROM (
  SELECT 
    p.id as user_id,
    (COALESCE(pr.pickup_count, 0) + COALESCE(db.digital_bin_count, 0)) as total_pickups,
    (COALESCE(p.points, 0) + COALESCE(pr.points_earned, 0) + COALESCE(db.digital_bin_points, 0) + COALESCE(dr.report_points, 0) - COALESCE(rr.points_spent, 0)) as total_points,
    COALESCE(b.total_bags, 0) as total_bags,
    COALESCE(b.batch_count, 0) as total_batches,
    COALESCE(dr.report_count, 0) as total_reports,
    GREATEST(
      COALESCE(pr.last_pickup, '1970-01-01'::timestamp),
      COALESCE(db.last_digital_bin, '1970-01-01'::timestamp),
      COALESCE(dr.last_report, '1970-01-01'::timestamp),
      COALESCE(b.last_batch, '1970-01-01'::timestamp)
    ) as last_activity_at,
    NOW() as computed_at
  FROM profiles p
  LEFT JOIN (
    SELECT user_id, COUNT(*) as pickup_count, SUM(points_earned) as points_earned, MAX(updated_at) as last_pickup
    FROM pickup_requests WHERE status != 'cancelled' GROUP BY user_id
  ) pr ON p.id = pr.user_id
  LEFT JOIN (
    SELECT user_id, COUNT(*) as digital_bin_count, COUNT(*) * 15 as digital_bin_points, MAX(updated_at) as last_digital_bin
    FROM digital_bins GROUP BY user_id
  ) db ON p.id = db.user_id
  LEFT JOIN (
    SELECT reported_by as user_id, COUNT(*) as report_count, 
    SUM(CASE WHEN severity = 'high' THEN 20 WHEN severity = 'medium' THEN 15 WHEN severity = 'low' THEN 10 ELSE 15 END) as report_points, 
    MAX(created_at) as last_report
    FROM illegal_dumping_mobile GROUP BY reported_by
  ) dr ON p.id = dr.user_id
  LEFT JOIN (
    SELECT created_by as user_id, COUNT(*) as batch_count, SUM(bag_count) as total_bags, MAX(updated_at) as last_batch
    FROM batches GROUP BY created_by
  ) b ON p.id = b.user_id
  LEFT JOIN (
    SELECT user_id, SUM(points_spent) as points_spent
    FROM rewards_redemption GROUP BY user_id
  ) rr ON p.id = rr.user_id
) aggregated_data;

-- Create index for materialized view
CREATE INDEX IF NOT EXISTS idx_user_stats_aggregated_user_id 
ON user_stats_aggregated(user_id);

-- Refresh the materialized view immediately with new data
REFRESH MATERIALIZED VIEW user_stats_aggregated;

-- Grant permissions
GRANT SELECT ON user_stats_aggregated TO authenticated, anon;

-- Add comment
COMMENT ON MATERIALIZED VIEW user_stats_aggregated IS 'Pre-computed aggregations refreshed every 5 minutes for sub-second dashboard loads (FIXED: now includes total_reports field)';
