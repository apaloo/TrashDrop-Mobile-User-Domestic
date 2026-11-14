-- Function public.get_dashboard_data_optimized
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_dashboard_data_optimized(user_id_param uuid, activity_limit integer): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_dashboard_data_optimized(user_id_param uuid, activity_limit integer DEFAULT 5)
 RETURNS TABLE(user_id uuid, total_points bigint, total_pickups bigint, total_bags bigint, total_batches bigint, level text, email text, first_name text, last_name text, avatar_url text, available_bags bigint, last_activity_at timestamp with time zone, activities jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.td_assert_self_or_staff(user_id_param);
  RETURN QUERY
  WITH dashboard_stats AS (
    SELECT
      p.id as user_id,
      -- the balance td_redeem_reward checks (user_stats_dashboard)
      COALESCE(v.total_points, 0)::BIGINT as total_points,
      COALESCE(v.total_pickups, 0)::BIGINT as total_pickups,
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
    LEFT JOIN public.user_stats_dashboard v ON v.user_id = p.id
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
          -- the balance's rule (user_stats_dashboard, docs/POINTS.md; TD51)
          CASE
            WHEN illegal_dumping_mobile.created_at >= '2026-10-31 00:00:00+00'::timestamptz
             AND (illegal_dumping_mobile.status IS NULL
                  OR illegal_dumping_mobile.status <> ALL (ARRAY['verified', 'in_progress', 'completed', 'disposed'])) THEN 0
            WHEN severity = 'high' THEN 20
            WHEN severity = 'medium' THEN 15
            WHEN severity = 'low' THEN 10
            ELSE 15
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
          CASE WHEN lower(COALESCE(status, '')) IN ('cancelled', 'canceled') THEN 0 ELSE 15 END::BIGINT as points_earned,
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
$function$;
