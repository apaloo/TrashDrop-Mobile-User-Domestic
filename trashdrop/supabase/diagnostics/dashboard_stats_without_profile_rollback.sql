-- Undo trashdrop/supabase/migrations/20261025000000_dashboard_stats_without_profile.sql
--
-- Restores user_stats_dashboard exactly as production had it on 2026-10-25
-- (pg_get_viewdef output): FROM profiles, every row visible to anyone who can
-- SELECT the view. One transaction.

BEGIN;
SET LOCAL search_path = public;

CREATE OR REPLACE VIEW public.user_stats_dashboard AS
 SELECT p.id AS user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.avatar_url,
    p.level,
    p.created_at AS user_created_at,
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
    GREATEST(COALESCE(pr.last_pickup, '1970-01-01 00:00:00'::timestamp without time zone::timestamp with time zone), COALESCE(db.last_digital_bin, '1970-01-01 00:00:00'::timestamp without time zone::timestamp with time zone), COALESCE(dr.last_report, '1970-01-01 00:00:00'::timestamp without time zone::timestamp with time zone), COALESCE(b.last_batch, '1970-01-01 00:00:00'::timestamp without time zone::timestamp with time zone), p.created_at) AS last_updated
   FROM profiles p
     LEFT JOIN ( SELECT pickup_requests.user_id,
            count(*) AS pickup_count,
            sum(pickup_requests.points_earned) AS points_earned,
            max(pickup_requests.created_at) AS last_pickup
           FROM pickup_requests
          WHERE pickup_requests.status <> ALL (ARRAY['cancelled'::text, 'rejected'::text])
          GROUP BY pickup_requests.user_id) pr ON p.id = pr.user_id
     LEFT JOIN ( SELECT digital_bins.user_id,
            count(*) AS digital_bin_count,
            count(*) * 15 AS digital_bin_points,
            max(digital_bins.updated_at) AS last_digital_bin
           FROM digital_bins
          GROUP BY digital_bins.user_id) db ON p.id = db.user_id
     LEFT JOIN ( SELECT illegal_dumping_mobile.reported_by AS user_id,
            count(*) AS report_count,
            sum(
                CASE
                    WHEN illegal_dumping_mobile.severity = 'high'::text THEN 20
                    WHEN illegal_dumping_mobile.severity = 'medium'::text THEN 15
                    WHEN illegal_dumping_mobile.severity = 'low'::text THEN 10
                    ELSE 15
                END) AS report_points,
            max(illegal_dumping_mobile.created_at) AS last_report
           FROM illegal_dumping_mobile
          GROUP BY illegal_dumping_mobile.reported_by) dr ON p.id = dr.user_id
     LEFT JOIN ( SELECT batches.created_by AS user_id,
            count(DISTINCT batches.id) AS batch_count,
            sum(batches.bag_count) AS total_bags,
            max(batches.updated_at) AS last_batch
           FROM batches
          GROUP BY batches.created_by) b ON p.id = b.user_id
     LEFT JOIN ( SELECT user_stats.user_id,
            user_stats.available_bags,
            user_stats.total_batches
           FROM user_stats) us ON p.id = us.user_id
     LEFT JOIN ( SELECT rewards_redemption.user_id,
            sum(rewards_redemption.points_spent) AS points_spent
           FROM rewards_redemption
          GROUP BY rewards_redemption.user_id) rr ON p.id = rr.user_id;

COMMENT ON VIEW public.user_stats_dashboard IS NULL;

COMMIT;
