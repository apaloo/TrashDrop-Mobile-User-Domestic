-- Illegal dumping reports earn their points once verified.
--
-- Points now buy airtime and data (20261030000000), so paying them the moment
-- a report is sent invites made-up reports. Agreed with the owner on
-- 2026-10-30: a report earns its points (high 20, medium 15, low 10) once the
-- TrashDrop team has verified it, i.e. its status is verified, in_progress,
-- completed or disposed.
--
-- Reports sent before 2026-10-31 00:00 UTC keep the points they already
-- earned, so no household's balance drops (and none goes below what they have
-- already redeemed). The report count is unchanged: every report still counts.
--
-- Only user_stats_dashboard.report_points (and so total_points) changes; the
-- view is otherwise exactly as 20261030000000 left it. The app applies the
-- same rule (src/utils/reportPoints.js). No data is created or changed.
-- Safe to re-run. One transaction.
-- Undo: supabase/diagnostics/report_points_when_verified_rollback.sql

BEGIN;
SET LOCAL search_path = public;

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
          GROUP BY digital_bins.user_id) db ON u.id = db.user_id
     LEFT JOIN ( SELECT illegal_dumping_mobile.reported_by AS user_id,
            count(*) AS report_count,
            sum(
                CASE
                    -- Points once the team has verified the report; reports
                    -- sent before 2026-10-31 keep the points they had
                    WHEN illegal_dumping_mobile.created_at >= '2026-10-31 00:00:00+00'::timestamptz
                     AND (illegal_dumping_mobile.status IS NULL
                          OR illegal_dumping_mobile.status <> ALL (ARRAY['verified'::text, 'in_progress'::text, 'completed'::text, 'disposed'::text])) THEN 0
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
          -- A rejected redemption gives its points back
          WHERE rewards_redemption.status IS DISTINCT FROM 'rejected'::text
          GROUP BY rewards_redemption.user_id) rr ON u.id = rr.user_id
  -- Signed-in users (and anon) see only their own row; the service role and
  -- database roles see every row
  WHERE u.id = auth.uid()
     OR current_user NOT IN ('anon', 'authenticated');;

COMMENT ON VIEW public.user_stats_dashboard IS
  'Dashboard stats for every account (profiles row optional). App users see only their own row; rejected reward redemptions are not counted as spent; dumping reports earn points once verified (from 2026-10-31). See 20261025000000, 20261030000000 and 20261031000000.';

COMMIT;
