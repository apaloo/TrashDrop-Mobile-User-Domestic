-- View public.dumping_duplicate_monitoring
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: service_role

create view public.dumping_duplicate_monitoring as
SELECT d.id,
    d.reported_by,
    d.location,
    d.latitude,
    d.longitude,
    d.waste_type,
    d.severity,
    d.status,
    d.created_at,
    d.location_hash,
    count(*) OVER (PARTITION BY d.location_hash) AS similar_reports,
    min(d.created_at) OVER (PARTITION BY d.location_hash) AS first_report_time,
        CASE
            WHEN (count(*) OVER (PARTITION BY d.location_hash) > 1) THEN 'POTENTIAL_DUPLICATE'::text
            ELSE 'UNIQUE'::text
        END AS duplicate_status
   FROM illegal_dumping_mobile d
  WHERE (d.created_at > (now() - '7 days'::interval))
  ORDER BY d.location_hash, d.created_at;
