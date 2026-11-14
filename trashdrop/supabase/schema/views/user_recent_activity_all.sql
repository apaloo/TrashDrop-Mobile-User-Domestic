-- View public.user_recent_activity_all
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: service_role

create view public.user_recent_activity_all as
SELECT COALESCE(pickup_requests.user_id, pickup_requests.assigned_to) AS user_id,
    'pickup_request'::text AS activity_type,
    (('Pickup request for '::text || COALESCE((pickup_requests.bag_count)::text, '1'::text)) || ' bag(s)'::text) AS description,
    COALESCE(pickup_requests.points_earned, 10) AS points_earned,
    pickup_requests.created_at,
    'pickup_request'::text AS source_type,
    pickup_requests.id AS activity_id,
    pickup_requests.created_at AS sort_timestamp
   FROM pickup_requests
  WHERE ((pickup_requests.status <> 'cancelled'::text) AND ((pickup_requests.user_id IS NOT NULL) OR (pickup_requests.assigned_to IS NOT NULL)))
UNION ALL
 SELECT illegal_dumping_mobile.reported_by AS user_id,
    'dumping_report'::text AS activity_type,
    'Reported illegal dumping'::text AS description,
        CASE
            WHEN (illegal_dumping_mobile.severity = 'high'::text) THEN 20
            WHEN (illegal_dumping_mobile.severity = 'medium'::text) THEN 15
            WHEN (illegal_dumping_mobile.severity = 'low'::text) THEN 10
            ELSE 15
        END AS points_earned,
    illegal_dumping_mobile.created_at,
    'dumping_report'::text AS source_type,
    (illegal_dumping_mobile.id)::text AS activity_id,
    illegal_dumping_mobile.created_at AS sort_timestamp
   FROM illegal_dumping_mobile
UNION ALL
 SELECT digital_bins.user_id,
    'digital_bin'::text AS activity_type,
    'Digital bin created'::text AS description,
    15 AS points_earned,
    digital_bins.created_at,
    'digital_bin'::text AS source_type,
    (digital_bins.id)::text AS activity_id,
    digital_bins.created_at AS sort_timestamp
   FROM digital_bins
UNION ALL
 SELECT user_activity.user_id,
    user_activity.activity_type,
    user_activity.description,
    user_activity.points_impact AS points_earned,
    user_activity.created_at,
    'user_activity'::text AS source_type,
    (user_activity.id)::text AS activity_id,
    user_activity.created_at AS sort_timestamp
   FROM user_activity
  WHERE (user_activity.activity_type <> 'pickup_request'::text);
