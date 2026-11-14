-- View public.admin_bag_scans
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: authenticated, service_role

create view public.admin_bag_scans as
SELECT s.id,
    s.bag_id,
    COALESCE(s.batch_id, g.batch_id) AS batch_id,
    COALESCE(s.scanned_at, ((to_jsonb(s.*) ->> 'created_at'::text))::timestamp with time zone) AS scanned_at,
    (s.scanned_by)::text AS scanned_by,
    td_person_label((s.scanned_by)::text) AS scanned_by_name,
    td_scan_location(to_jsonb(s.*)) AS location,
    s.status
   FROM (scans s
     LEFT JOIN bags g ON ((g.id = s.bag_id)))
  WHERE td_is_staff();
