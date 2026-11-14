-- View public.unified_pickup_status
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: service_role

create view public.unified_pickup_status as
SELECT 'pickup_request'::text AS request_type,
    pickup_requests.id,
    (pickup_requests.user_id)::text AS user_id,
    pickup_requests.status,
    pickup_requests.created_at,
    pickup_requests.updated_at,
    (COALESCE(pickup_requests.fee, 0))::numeric AS fee,
    COALESCE(pickup_requests.bag_count, (0)::bigint) AS bag_count,
    COALESCE(pickup_requests.waste_type, 'general'::text) AS waste_type
   FROM pickup_requests
UNION ALL
 SELECT 'digital_bin'::text AS request_type,
    (digital_bins.id)::text AS id,
    (digital_bins.user_id)::text AS user_id,
    digital_bins.status,
    digital_bins.created_at,
    digital_bins.updated_at,
    COALESCE(digital_bins.fee, (0)::numeric) AS fee,
    (COALESCE(digital_bins.bag_count, 0))::bigint AS bag_count,
    (COALESCE(digital_bins.waste_type, 'general'::character varying))::text AS waste_type
   FROM digital_bins;
