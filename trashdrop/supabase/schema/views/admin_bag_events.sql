-- View public.admin_bag_events
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: authenticated, service_role

create view public.admin_bag_events as
SELECT i.id AS bag_id,
    i.batch_id,
    i.bag_no,
    'household_scan'::text AS kind,
    i.created_at AS at,
    i.household_name AS actor,
    NULL::text AS location,
    'Batch QR scanned by household'::text AS label
   FROM admin_bag_items i
  WHERE (i.household_id IS NOT NULL)
UNION ALL
 SELECT i.id AS bag_id,
    i.batch_id,
    i.bag_no,
    'pickup_requested'::text AS kind,
    i.pickup_requested_at AS at,
    i.household_name AS actor,
    i.pickup_address AS location,
    'Pickup requested'::text AS label
   FROM admin_bag_items i
  WHERE (i.pickup_id IS NOT NULL)
UNION ALL
 SELECT i.id AS bag_id,
    i.batch_id,
    i.bag_no,
    'collected'::text AS kind,
    i.collected_at AS at,
    i.collector_name AS actor,
    i.pickup_address AS location,
    'Collected'::text AS label
   FROM admin_bag_items i
  WHERE (i.collected_at IS NOT NULL)
UNION ALL
 SELECT s.bag_id,
    s.batch_id,
    i.bag_no,
    'scan'::text AS kind,
    s.scanned_at AS at,
    s.scanned_by_name AS actor,
    s.location,
    ('Scanned'::text || COALESCE(((' ('::text || s.status) || ')'::text), ''::text)) AS label
   FROM (admin_bag_scans s
     LEFT JOIN admin_bag_items i ON ((i.id = s.bag_id)));
