-- View public.dumping_duplicate_monitoring
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: service_role

create view public.dumping_duplicate_monitoring as
SELECT id,
    reported_by,
    location,
    latitude,
    longitude,
    waste_type,
    severity,
    status,
    created_at,
    location_hash,
    count(*) OVER (PARTITION BY location_hash) AS similar_reports,
    min(created_at) OVER (PARTITION BY location_hash) AS first_report_time,
        CASE
            WHEN (count(*) OVER (PARTITION BY location_hash) > 1) THEN 'POTENTIAL_DUPLICATE'::text
            ELSE 'UNIQUE'::text
        END AS duplicate_status
   FROM illegal_dumping_mobile d
  WHERE (created_at > (now() - '7 days'::interval))
  ORDER BY location_hash, created_at;
