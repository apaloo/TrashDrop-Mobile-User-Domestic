-- Fix batch counting to count distinct batches instead of all rows
-- This resolves the issue where batch count was incorrectly showing same number as bags

-- Step 1: Update the user_stats_dashboard view
DROP VIEW IF EXISTS user_stats_dashboard;

CREATE VIEW user_stats_dashboard AS
SELECT 
  p.id as user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.avatar_url,
  p.level,
  p.created_at as user_created_at,
  
  -- Pickup requests count (excluding digital bins)
  COALESCE(pr.pickup_count, 0) as pickups,
  COALESCE(pr.points_earned, 0) as pickup_points,
  
  -- Digital bins count
  COALESCE(db.digital_bin_count, 0) as digital_bins,
  COALESCE(db.digital_bin_points, 0) as digital_bin_points,
  
  -- Total pickups (requests + digital bins)
  COALESCE(pr.pickup_count, 0) + COALESCE(db.digital_bin_count, 0) as total_pickups,
  
  -- Dumping reports count
  COALESCE(dr.report_count, 0) as reports,
  COALESCE(dr.report_points, 0) as report_points,
  
  -- Batches and bags from user_stats table (authoritative source for batch count)
  COALESCE(us.total_batches, 0) as batches,
  COALESCE(b.total_bags, 0) as total_bags,
  
  -- Available bags from user_stats table
  COALESCE(us.available_bags, 0) as available_bags,
  
  -- Points calculation
  (COALESCE(p.points, 0) + COALESCE(pr.points_earned, 0) + COALESCE(db.digital_bin_points, 0) + COALESCE(dr.report_points, 0) - COALESCE(rr.points_spent, 0)) as total_points,
  
  -- Last activity timestamps
  GREATEST(
    COALESCE(pr.last_pickup, '1970-01-01'::timestamp),
    COALESCE(db.last_digital_bin, '1970-01-01'::timestamp),
    COALESCE(dr.last_report, '1970-01-01'::timestamp),
    COALESCE(b.last_batch, '1970-01-01'::timestamp),
    p.created_at
  ) as last_updated

FROM profiles p

LEFT JOIN (
  SELECT 
    user_id,
    COUNT(*) as pickup_count,
    SUM(points_earned) as points_earned,
    MAX(created_at) as last_pickup
  FROM pickup_requests 
  WHERE status NOT IN ('cancelled', 'rejected')
  GROUP BY user_id
) pr ON p.id = pr.user_id

LEFT JOIN (
  SELECT 
    user_id,
    COUNT(*) as digital_bin_count,
    COUNT(*) * 15 as digital_bin_points,
    MAX(updated_at) as last_digital_bin
  FROM digital_bins 
  GROUP BY user_id
) db ON p.id = db.user_id

LEFT JOIN (
  SELECT 
    reported_by as user_id,
    COUNT(*) as report_count,
    SUM(
      CASE 
        WHEN severity = 'high' THEN 20
        WHEN severity = 'medium' THEN 15
        WHEN severity = 'low' THEN 10
        ELSE 15
      END
    ) as report_points,
    MAX(created_at) as last_report
  FROM illegal_dumping_mobile 
  GROUP BY reported_by
) dr ON p.id = dr.user_id

LEFT JOIN (
  SELECT 
    created_by as user_id,
    COUNT(DISTINCT id) as batch_count,
    SUM(bag_count) as total_bags,
    MAX(updated_at) as last_batch
  FROM batches 
  GROUP BY created_by
) b ON p.id = b.user_id

LEFT JOIN (
  SELECT 
    user_id,
    available_bags,
    total_batches
  FROM user_stats
) us ON p.id = us.user_id

LEFT JOIN (
  SELECT 
    user_id,
    SUM(points_spent) as points_spent
  FROM rewards_redemption 
  GROUP BY user_id
) rr ON p.id = rr.user_id;

-- Step 2: Update the materialized view
DROP MATERIALIZED VIEW IF EXISTS user_stats_aggregated;

CREATE MATERIALIZED VIEW user_stats_aggregated AS
SELECT 
  p.id as user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.avatar_url,
  p.level,
  p.created_at as user_created_at,
  
  -- Pickup requests count (excluding digital bins)
  COALESCE(pr.pickup_count, 0) as pickups,
  COALESCE(pr.points_earned, 0) as pickup_points,
  
  -- Digital bins count
  COALESCE(db.digital_bin_count, 0) as digital_bins,
  COALESCE(db.digital_bin_points, 0) as digital_bin_points,
  
  -- Total pickups (requests + digital bins)
  (COALESCE(pr.pickup_count, 0) + COALESCE(db.digital_bin_count, 0)) as total_pickups,
  
  -- Dumping reports count
  COALESCE(dr.report_count, 0) as total_reports,
  COALESCE(dr.report_points, 0) as report_points,
  
  -- Batches and bags from user_stats table (authoritative source for batch count)
  COALESCE(us.total_batches, 0) as total_batches,
  COALESCE(b.total_bags, 0) as total_bags,
  
  -- Available bags from user_stats table
  COALESCE(us.available_bags, 0) as available_bags,
  
  -- Points calculation
  (COALESCE(p.points, 0) + COALESCE(pr.points_earned, 0) + COALESCE(db.digital_bin_points, 0) + COALESCE(dr.report_points, 0) - COALESCE(rr.points_spent, 0)) as total_points,
  
  -- Last activity timestamps
  GREATEST(
    COALESCE(pr.last_pickup, '1970-01-01'::timestamp),
    COALESCE(db.last_digital_bin, '1970-01-01'::timestamp),
    COALESCE(dr.last_report, '1970-01-01'::timestamp),
    COALESCE(b.last_batch, '1970-01-01'::timestamp),
    p.created_at
  ) as last_activity_at

FROM profiles p

LEFT JOIN (
  SELECT 
    user_id,
    COUNT(*) as pickup_count,
    SUM(points_earned) as points_earned,
    MAX(created_at) as last_pickup
  FROM pickup_requests 
  WHERE status NOT IN ('cancelled', 'rejected')
  GROUP BY user_id
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
    SELECT created_by as user_id, COUNT(DISTINCT id) as batch_count, SUM(bag_count) as total_bags, MAX(updated_at) as last_batch
    FROM batches GROUP BY created_by
  ) b ON p.id = b.user_id

LEFT JOIN (
  SELECT 
    user_id,
    available_bags,
    total_batches
  FROM user_stats
) us ON p.id = us.user_id

LEFT JOIN (
  SELECT user_id, SUM(points_spent) as points_spent
  FROM rewards_redemption GROUP BY user_id
) rr ON p.id = rr.user_id;

-- Create unique index for materialized view (required for concurrent refresh)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_stats_aggregated_user_id_unique 
ON user_stats_aggregated(user_id);

-- Create regular index as backup
CREATE INDEX IF NOT EXISTS idx_user_stats_aggregated_user_id 
ON user_stats_aggregated(user_id);

-- Step 3: Refresh materialized view to apply changes
REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats_aggregated;

-- Step 4: Verify the fix
SELECT 
  user_id,
  email,
  batches,
  total_bags,
  'Batch count should now be less than or equal to bag count' as verification_note
FROM user_stats_dashboard 
WHERE user_id = '15df32cb-8401-4f5f-8ed0-5c34c0a993d0'
ORDER BY user_id;
