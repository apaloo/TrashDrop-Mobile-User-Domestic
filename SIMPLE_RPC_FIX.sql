-- SIMPLE FIX: Remove regex pattern matching and handle integer properly
-- Error: "operator does not exist: integer ~ unknown"

DROP FUNCTION IF EXISTS get_dashboard_data_optimized(UUID, INT);

CREATE OR REPLACE FUNCTION get_dashboard_data_optimized(user_id_param UUID, activity_limit INT DEFAULT 5)
RETURNS TABLE (
  user_id UUID,
  total_points BIGINT,
  total_pickups BIGINT,
  total_bags BIGINT,
  total_batches BIGINT,
  level TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  available_bags BIGINT,
  last_activity_at TIMESTAMPTZ,
  activities JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH dashboard_stats AS (
    SELECT 
      p.id as user_id,
      COALESCE(p.points, 0)::BIGINT + 
      COALESCE(pr.points_earned, 0)::BIGINT + 
      COALESCE(db.digital_bin_points, 0)::BIGINT + 
      COALESCE(dr.report_points, 0)::BIGINT - 
      COALESCE(rr.points_spent, 0)::BIGINT as total_points,
      (COALESCE(pr.pickup_count, 0) + COALESCE(db.digital_bin_count, 0))::BIGINT as total_pickups,
      -- FIXED: Simple cast to BIGINT, no regex needed
      COALESCE(us.total_bags, 0)::BIGINT as total_bags,
      COALESCE(us.available_bags, 0)::BIGINT as available_bags,
      COALESCE(p.level, 'Eco Starter') as level,
      p.email,
      p.first_name,
      p.last_name,
      p.avatar_url,
      COALESCE(b.batch_count, 0)::BIGINT as total_batches,
      us.last_activity_at
    FROM profiles p
    LEFT JOIN (
      SELECT 
        pickup_requests.user_id,
        COUNT(*)::BIGINT as pickup_count,
        SUM(points_earned)::BIGINT as points_earned
      FROM pickup_requests 
      WHERE status != 'cancelled' AND pickup_requests.user_id = user_id_param
      GROUP BY pickup_requests.user_id
    ) pr ON p.id = pr.user_id
    LEFT JOIN (
      SELECT 
        digital_bins.user_id,
        COUNT(*)::BIGINT as digital_bin_count,
        (COUNT(*) * 15)::BIGINT as digital_bin_points
      FROM digital_bins 
      WHERE digital_bins.user_id = user_id_param
      GROUP BY digital_bins.user_id
    ) db ON p.id = db.user_id
    LEFT JOIN (
      SELECT 
        illegal_dumping_mobile.reported_by as user_id,
        COUNT(*)::BIGINT as report_count,
        SUM(
          CASE 
            WHEN severity = 'high' THEN 20
            WHEN severity = 'medium' THEN 15
            WHEN severity = 'low' THEN 10
            ELSE 15
          END
        )::BIGINT as report_points
      FROM illegal_dumping_mobile 
      WHERE illegal_dumping_mobile.reported_by = user_id_param
      GROUP BY illegal_dumping_mobile.reported_by
    ) dr ON p.id = dr.user_id
    LEFT JOIN (
      SELECT 
        user_stats.user_id,
        user_stats.available_bags,
        user_stats.total_bags,
        user_stats.created_at as last_activity_at
      FROM user_stats
      WHERE user_stats.user_id = user_id_param
    ) us ON p.id = us.user_id
    LEFT JOIN (
      SELECT 
        rewards_redemption.user_id,
        SUM(points_spent)::BIGINT as points_spent
      FROM rewards_redemption 
      WHERE rewards_redemption.user_id = user_id_param
      GROUP BY rewards_redemption.user_id
    ) rr ON p.id = rr.user_id
    LEFT JOIN (
      SELECT 
        batches.created_by as user_id,
        COUNT(*)::BIGINT as batch_count
      FROM batches 
      WHERE batches.created_by = user_id_param
      GROUP BY batches.created_by
    ) b ON p.id = b.user_id
    WHERE p.id = user_id_param
  ),
  recent_activities AS (
    SELECT 
      jsonb_agg(
        jsonb_build_object(
          'user_id', activity_user_id,
          'activity_type', activity_type,
          'description', description,
          'points_earned', points_earned,
          'created_at', created_at,
          'source_type', source_type,
          'activity_id', activity_id
        )
      ) as activities
    FROM (
      SELECT 
        activity_user_id,
        activity_type,
        description,
        points_earned,
        created_at,
        source_type,
        activity_id
      FROM (
        SELECT 
          COALESCE(pickup_requests.user_id, pickup_requests.assigned_to) as activity_user_id,
          'pickup_request' as activity_type,
          'Pickup request for ' || COALESCE(bag_count::text, '1') || ' bag(s)' as description,
          COALESCE(points_earned, 10)::BIGINT as points_earned,
          created_at,
          'pickup_request' as source_type,
          id::text as activity_id,
          created_at as sort_timestamp
        FROM pickup_requests 
        WHERE status != 'cancelled' AND COALESCE(pickup_requests.user_id, pickup_requests.assigned_to) = user_id_param
        
        UNION ALL
        
        SELECT 
          illegal_dumping_mobile.reported_by as activity_user_id,
          'dumping_report' as activity_type,
          'Illegal dumping reported' as description,
          CASE 
            WHEN severity = 'high' THEN 50
            WHEN severity = 'medium' THEN 30
            WHEN severity = 'low' THEN 15
            ELSE 25
          END::BIGINT as points_earned,
          created_at,
          'dumping_report' as source_type,
          id::text as activity_id,
          created_at as sort_timestamp
        FROM illegal_dumping_mobile
        WHERE illegal_dumping_mobile.reported_by = user_id_param
        
        UNION ALL
        
        SELECT 
          digital_bins.user_id as activity_user_id,
          'digital_bin' as activity_type,
          'Digital bin created' as description,
          15::BIGINT as points_earned,
          created_at,
          'digital_bin' as source_type,
          id::text as activity_id,
          created_at as sort_timestamp
        FROM digital_bins
        WHERE digital_bins.user_id = user_id_param
        
        UNION ALL
        
        SELECT 
          user_activity.user_id as activity_user_id,
          activity_type,
          description,
          COALESCE(points_impact, 0)::BIGINT as points_earned,
          created_at,
          'user_activity' as source_type,
          id::text as activity_id,
          created_at as sort_timestamp
        FROM user_activity
        WHERE user_activity.user_id = user_id_param AND activity_type != 'pickup_request'
      ) ordered_activities
      WHERE activity_user_id = user_id_param
      ORDER BY sort_timestamp DESC
      LIMIT activity_limit
    ) limited_activities
  )
  SELECT 
    ds.*,
    COALESCE(ra.activities, '[]'::jsonb) as activities
  FROM dashboard_stats ds
  LEFT JOIN recent_activities ra ON true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_dashboard_data_optimized TO authenticated, anon;
