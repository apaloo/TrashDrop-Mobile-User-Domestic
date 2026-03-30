-- Dashboard RPC Functions Migration
-- Creates optimized RPC functions for dashboard data fetching

-- Create optimized dashboard data RPC function
CREATE OR REPLACE FUNCTION get_dashboard_data_optimized(
  user_id_param UUID,
  activity_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  user_id UUID,
  total_points BIGINT,
  total_pickups BIGINT,
  total_bags BIGINT,
  total_batches BIGINT,
  available_bags BIGINT,
  level TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  last_updated TIMESTAMPTZ,
  activities JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH dashboard_stats AS (
    SELECT 
      p.id as user_id,
      COALESCE(p.points, 0) + 
      COALESCE(pr.points_earned, 0) + 
      COALESCE(db.digital_bin_points, 0) + 
      COALESCE(dr.report_points, 0) - 
      COALESCE(rr.points_spent, 0) as total_points,
      (COALESCE(pr.pickup_count, 0) + COALESCE(db.digital_bin_count, 0)) as total_pickups,
      COALESCE(b.total_bags, 0) as total_bags,
      COALESCE(b.batch_count, 0) as total_batches,
      COALESCE(us.available_bags, 0) as available_bags,
      COALESCE(p.level, 'Eco Starter') as level,
      p.email,
      p.first_name,
      p.last_name,
      p.avatar_url,
      GREATEST(
        COALESCE(pr.last_pickup, '1970-01-01'::timestamp),
        COALESCE(db.last_digital_bin, '1970-01-01'::timestamp),
        COALESCE(dr.last_report, '1970-01-01'::timestamp),
        COALESCE(b.last_batch, '1970-01-01'::timestamp)
      ) as last_updated
    FROM profiles p
    LEFT JOIN (
      SELECT 
        user_id,
        COUNT(*) as pickup_count,
        SUM(points_earned) as points_earned,
        MAX(updated_at) as last_pickup
      FROM pickup_requests 
      WHERE status != 'cancelled' AND user_id = user_id_param
      GROUP BY user_id
    ) pr ON p.id = pr.user_id
    LEFT JOIN (
      SELECT 
        user_id,
        COUNT(*) as digital_bin_count,
        COUNT(*) * 15 as digital_bin_points,
        MAX(updated_at) as last_digital_bin
      FROM digital_bins 
      WHERE user_id = user_id_param
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
      WHERE reported_by = user_id_param
      GROUP BY reported_by
    ) dr ON p.id = dr.user_id
    LEFT JOIN (
      SELECT 
        created_by as user_id,
        COUNT(*) as batch_count,
        SUM(bag_count) as total_bags,
        MAX(updated_at) as last_batch
      FROM batches 
      WHERE created_by = user_id_param
      GROUP BY created_by
    ) b ON p.id = b.user_id
    LEFT JOIN (
      SELECT 
        user_id,
        available_bags
      FROM user_stats
      WHERE user_id = user_id_param
    ) us ON p.id = us.user_id
    LEFT JOIN (
      SELECT 
        user_id,
        SUM(points_spent) as points_spent
      FROM rewards_redemption 
      WHERE user_id = user_id_param
      GROUP BY user_id
    ) rr ON p.id = rr.user_id
    WHERE p.id = user_id_param
  ),
  recent_activities AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'activity_id', activity_id,
        'activity_type', activity_type,
        'description', description,
        'points_earned', points_earned,
        'created_at', created_at,
        'source_type', source_type
      ) ORDER BY sort_timestamp DESC
    ) as activities
    FROM (
      SELECT 
        COALESCE(pickup_requests.user_id, pickup_requests.assigned_to) as activity_user_id,
        'pickup_request' as activity_type,
        'Pickup request for ' || COALESCE(bag_count::text, '1') || ' bag(s)' as description,
        COALESCE(points_earned, 10) as points_earned,
        created_at,
        'pickup_request' as source_type,
        id::text as activity_id,
        created_at as sort_timestamp
      FROM pickup_requests 
      WHERE status != 'cancelled' AND (COALESCE(pickup_requests.user_id, pickup_requests.assigned_to) = user_id_param)
      
      UNION ALL
      
      SELECT 
        reported_by as activity_user_id,
        'dumping_report' as activity_type,
        'Reported illegal dumping' as description,
        CASE 
          WHEN severity = 'high' THEN 20
          WHEN severity = 'medium' THEN 15
          WHEN severity = 'low' THEN 10
          ELSE 15
        END as points_earned,
        created_at,
        'dumping_report' as source_type,
        id::text as activity_id,
        created_at as sort_timestamp
      FROM illegal_dumping_mobile
      WHERE reported_by = user_id_param
      
      UNION ALL
      
      SELECT 
        digital_bins.user_id as activity_user_id,
        'digital_bin' as activity_type,
        'Digital bin created' as description,
        15 as points_earned,
        created_at,
        'digital_bin' as source_type,
        id::text as activity_id,
        created_at as sort_timestamp
      FROM digital_bins
      WHERE activity_user_id = user_id_param
      
      UNION ALL
      
      SELECT 
        user_activity.user_id as activity_user_id,
        activity_type,
        description,
        points_impact as points_earned,
        created_at,
        'user_activity' as source_type,
        id::text as activity_id,
        created_at as sort_timestamp
      FROM user_activity
      WHERE activity_user_id = user_id_param AND activity_type != 'pickup_request'
    ) all_activities
    WHERE activity_user_id = user_id_param
    ORDER BY sort_timestamp DESC
    LIMIT activity_limit
  )
  SELECT 
    ds.*,
    COALESCE(ra.activities, '[]'::jsonb) as activities
  FROM dashboard_stats ds
  LEFT JOIN recent_activities ra ON true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create critical stats RPC function for instant UI
CREATE OR REPLACE FUNCTION get_critical_stats(user_id_param UUID)
RETURNS TABLE (
  user_id UUID,
  total_points BIGINT,
  total_pickups BIGINT,
  available_bags BIGINT,
  level TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    COALESCE(p.points, 0) + 
    COALESCE(pr.points_earned, 0) + 
    COALESCE(db.digital_bin_points, 0) + 
    COALESCE(dr.report_points, 0) - 
    COALESCE(rr.points_spent, 0) as total_points,
    (COALESCE(pr.pickup_count, 0) + COALESCE(db.digital_bin_count, 0)) as total_pickups,
    COALESCE(us.available_bags, 0) as available_bags,
    COALESCE(p.level, 'Eco Starter') as level,
    p.email,
    p.first_name,
    p.last_name,
    p.avatar_url
  FROM profiles p
  LEFT JOIN (
    SELECT 
      user_id,
      COUNT(*) as pickup_count,
      SUM(points_earned) as points_earned
    FROM pickup_requests 
    WHERE status != 'cancelled' AND pickup_requests.user_id = user_id_param
    GROUP BY pickup_requests.user_id
  ) pr ON p.id = pr.user_id
  LEFT JOIN (
    SELECT 
      user_id,
      COUNT(*) as digital_bin_count,
      COUNT(*) * 15 as digital_bin_points
    FROM digital_bins 
    WHERE digital_bins.user_id = user_id_param
    GROUP BY digital_bins.user_id
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
      ) as report_points
    FROM illegal_dumping_mobile 
    WHERE illegal_dumping_mobile.reported_by = user_id_param
    GROUP BY illegal_dumping_mobile.reported_by
  ) dr ON p.id = dr.user_id
  LEFT JOIN (
    SELECT 
      user_id,
      available_bags
    FROM user_stats
    WHERE user_stats.user_id = user_id_param
  ) us ON p.id = us.user_id
  LEFT JOIN (
    SELECT 
      user_id,
      SUM(points_spent) as points_spent
    FROM rewards_redemption 
    WHERE rewards_redemption.user_id = user_id_param
    GROUP BY rewards_redemption.user_id
  ) rr ON p.id = rr.user_id
  WHERE p.id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions for the new RPC functions
GRANT EXECUTE ON FUNCTION get_dashboard_data_optimized TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_critical_stats TO authenticated, anon;

-- Add indexes to support the RPC functions
CREATE INDEX IF NOT EXISTS idx_pickup_requests_user_status_points 
ON pickup_requests(user_id, status, points_earned);

CREATE INDEX IF NOT EXISTS idx_digital_bins_user_points 
ON digital_bins(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_illegal_dumping_reporter_severity 
ON illegal_dumping_mobile(reported_by, severity);

CREATE INDEX IF NOT EXISTS idx_rewards_redemption_user_spent 
ON rewards_redemption(user_id, points_spent);
