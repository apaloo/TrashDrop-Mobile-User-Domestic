-- Rewards: mobile airtime and data bundles, sent by TrashDrop staff.
--
-- Physical rewards (water bottle, tote bag) are out of reach for now. Agreed
-- with the owner on 2026-10-30:
--   * 200 points = GH₵1
--   * Airtime GH₵5 / 10 / 20 and data GH₵5 / 10 / 20
--     (1,000 / 2,000 / 4,000 points)
--   * Staff send each one by hand from the admin site, then mark it sent;
--     a rejected redemption gives its points back.
--
-- 1. Backs up public.rewards to public.rewards_backup_20261030 (no app access).
-- 2. Hides every active reward that is not airtime or data (active = false;
--    nothing is deleted, redemptions already made keep their reward).
-- 3. Adds the six airtime and data rewards (skipped if already there).
-- 4. rewards_redemption gets what staff need to send it: the phone number and
--    network to top up, when it was sent, by whom, and a note.
-- 5. user_stats_dashboard no longer counts rejected redemptions as spent
--    (same columns as 20261025000000, which it otherwise repeats exactly).
--
-- Before running: supabase/diagnostics/airtime_data_rewards_preflight.sql
-- Safe to re-run. One transaction.
-- Undo: supabase/diagnostics/airtime_data_rewards_rollback.sql

BEGIN;
SET LOCAL search_path = public;

-- 1. Backup (first run only)
CREATE TABLE IF NOT EXISTS public.rewards_backup_20261030 AS TABLE public.rewards;
ALTER TABLE public.rewards_backup_20261030 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rewards_backup_20261030 FROM anon, authenticated;
COMMENT ON TABLE public.rewards_backup_20261030 IS
  'public.rewards before 20261030000000_airtime_data_rewards.sql; used by its rollback.';

ALTER TABLE public.rewards ADD COLUMN IF NOT EXISTS category text;

-- 2. Hide physical rewards
UPDATE public.rewards
   SET active = false
 WHERE active
   AND COALESCE(category, '') NOT IN ('airtime', 'data');

-- 3. Airtime and data, 200 points per GH₵1
INSERT INTO public.rewards (name, description, points_cost, category, active)
SELECT v.name, v.description, v.points_cost, v.category, true
  FROM (VALUES
    ('Airtime GH₵5',  'GH₵5 airtime to your phone (MTN, Telecel or AirtelTigo)',  1000, 'airtime'),
    ('Airtime GH₵10', 'GH₵10 airtime to your phone (MTN, Telecel or AirtelTigo)', 2000, 'airtime'),
    ('Airtime GH₵20', 'GH₵20 airtime to your phone (MTN, Telecel or AirtelTigo)', 4000, 'airtime'),
    ('Data GH₵5',     'GH₵5 data bundle on your network (MTN, Telecel or AirtelTigo)',  1000, 'data'),
    ('Data GH₵10',    'GH₵10 data bundle on your network (MTN, Telecel or AirtelTigo)', 2000, 'data'),
    ('Data GH₵20',    'GH₵20 data bundle on your network (MTN, Telecel or AirtelTigo)', 4000, 'data')
  ) AS v(name, description, points_cost, category)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.rewards r WHERE r.name = v.name AND r.category = v.category
 );

-- 4. What staff need to send it
ALTER TABLE public.rewards_redemption
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS network text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS handled_by uuid,
  ADD COLUMN IF NOT EXISTS staff_note text;

COMMENT ON COLUMN public.rewards_redemption.phone_number IS 'Number to top up (airtime and data rewards)';
COMMENT ON COLUMN public.rewards_redemption.network IS 'MTN, Telecel or AirtelTigo';
COMMENT ON COLUMN public.rewards_redemption.status IS 'pending, sent or rejected (rejected gives the points back)';

-- 5. Rejected redemptions give their points back
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
  'Dashboard stats for every account (profiles row optional). App users see only their own row; rejected reward redemptions are not counted as spent. See 20261025000000 and 20261030000000.';

COMMIT;
