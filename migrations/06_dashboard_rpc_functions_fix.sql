-- Fix remaining ambiguous column references in get_critical_stats function
-- This should be applied after the main migration

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

-- Grant permissions (in case they were lost)
GRANT EXECUTE ON FUNCTION get_critical_stats TO authenticated, anon;
