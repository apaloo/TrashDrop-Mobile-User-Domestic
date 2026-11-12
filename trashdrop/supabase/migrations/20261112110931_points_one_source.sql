-- Points rules (owner approved 2026-11-12), one source for every balance:
-- 1. A cancelled digital bin earns no points (cancelled pickup requests
--    already earned none). It no longer counts as a pickup either.
-- 2. get_dashboard_data_optimized shows the balance and pickup count from
--    user_stats_dashboard, the balance td_redeem_reward checks, instead of
--    its own older copy of the rules. Its activity list shows 0 points for
--    a cancelled bin and is otherwise unchanged.
-- Specification: docs/POINTS.md.

CREATE OR REPLACE VIEW public.user_stats_dashboard AS
 SELECT u.id AS user_id,
    COALESCE(p.email, u.email::text) AS email,
    p.first_name,
    p.last_name,
    p.avatar_url,
    COALESCE(p.level, 'Eco Starter'::text) AS level,
    COALESCE(p.created_at, u.created_at) AS user_created_at,
    COALESCE(pr.pickup_count, 0::bigint) AS pickups,
    COALESCE(pr.points_earned, 0::bigint) AS pickup_points,
    COALESCE(db.digital_bin_count, 0::bigint) AS digital_bins,
    COALESCE(db.digital_bin_points, 0::bigint) AS digital_bin_points,
    COALESCE(pr.pickup_count, 0::bigint) + COALESCE(db.digital_bin_count, 0::bigint) AS total_pickups,
    COALESCE(dr.report_count, 0::bigint) AS reports,
    COALESCE(dr.report_points, 0::bigint) AS report_points,
    COALESCE(us.total_batches, 0) AS batches,
    COALESCE(b.total_bags, 0::bigint) AS total_bags,
    COALESCE(us.available_bags, 0) AS available_bags,
    COALESCE(p.points, 0) + COALESCE(pr.points_earned, 0::bigint) + COALESCE(db.digital_bin_points, 0::bigint) + COALESCE(dr.report_points, 0::bigint) - COALESCE(rr.points_spent, 0::bigint) AS total_points,
    GREATEST(COALESCE(pr.last_pickup, '1970-01-01 00:00:00'::timestamp without time zone::timestamp with time zone), COALESCE(db.last_digital_bin, '1970-01-01 00:00:00'::timestamp without time zone::timestamp with time zone), COALESCE(dr.last_report, '1970-01-01 00:00:00'::timestamp without time zone::timestamp with time zone), COALESCE(b.last_batch, '1970-01-01 00:00:00'::timestamp without time zone::timestamp with time zone), COALESCE(p.created_at, u.created_at)) AS last_updated
   FROM auth.users u
     LEFT JOIN profiles p ON p.id = u.id
     LEFT JOIN ( SELECT pickup_requests.user_id,
            count(*) AS pickup_count,
            sum(pickup_requests.points_earned) AS points_earned,
            max(pickup_requests.created_at) AS last_pickup
           FROM pickup_requests
          WHERE pickup_requests.status <> ALL (ARRAY['cancelled'::text, 'rejected'::text])
          GROUP BY pickup_requests.user_id) pr ON u.id = pr.user_id
     LEFT JOIN ( SELECT digital_bins.user_id,
            count(*) AS digital_bin_count,
            count(*) * 15 AS digital_bin_points,
            max(digital_bins.updated_at) AS last_digital_bin
           FROM digital_bins
          WHERE lower(COALESCE(digital_bins.status, ''::text)) <> ALL (ARRAY['cancelled'::text, 'canceled'::text])
          GROUP BY digital_bins.user_id) db ON u.id = db.user_id
     LEFT JOIN ( SELECT illegal_dumping_mobile.reported_by AS user_id,
            count(*) AS report_count,
            sum(
                CASE
                    WHEN illegal_dumping_mobile.created_at >= '2026-10-31 00:00:00+00'::timestamp with time zone AND (illegal_dumping_mobile.status IS NULL OR (illegal_dumping_mobile.status <> ALL (ARRAY['verified'::text, 'in_progress'::text, 'completed'::text, 'disposed'::text]))) THEN 0
                    WHEN illegal_dumping_mobile.severity = 'high'::text THEN 20
                    WHEN illegal_dumping_mobile.severity = 'medium'::text THEN 15
                    WHEN illegal_dumping_mobile.severity = 'low'::text THEN 10
                    ELSE 15
                END) AS report_points,
            max(illegal_dumping_mobile.created_at) AS last_report
           FROM illegal_dumping_mobile
          GROUP BY illegal_dumping_mobile.reported_by) dr ON u.id = dr.user_id
     LEFT JOIN ( SELECT batches.created_by AS user_id,
            count(DISTINCT batches.id) AS batch_count,
            sum(batches.bag_count) AS total_bags,
            max(batches.updated_at) AS last_batch
           FROM batches
          GROUP BY batches.created_by) b ON u.id = b.user_id
     LEFT JOIN ( SELECT user_stats.user_id,
            user_stats.available_bags,
            user_stats.total_batches
           FROM user_stats) us ON u.id = us.user_id
     LEFT JOIN ( SELECT rewards_redemption.user_id,
            sum(rewards_redemption.points_spent) AS points_spent
           FROM rewards_redemption
          WHERE rewards_redemption.status IS DISTINCT FROM 'rejected'::text
          GROUP BY rewards_redemption.user_id) rr ON u.id = rr.user_id
  WHERE u.id = auth.uid() OR (CURRENT_USER <> ALL (ARRAY['anon'::name, 'authenticated'::name]));

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
