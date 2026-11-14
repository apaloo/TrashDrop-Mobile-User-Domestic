-- View public.user_dumping_activity
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: service_role

create view public.user_dumping_activity as
SELECT reported_by,
    count(*) AS total_reports,
    count(
        CASE
            WHEN (location_hash IN ( SELECT d2.location_hash
               FROM illegal_dumping_mobile d2
              WHERE (d2.reported_by = illegal_dumping_mobile.reported_by)
              GROUP BY d2.location_hash
             HAVING (count(*) > 1))) THEN 1
            ELSE NULL::integer
        END) AS potential_duplicates,
    round((((count(
        CASE
            WHEN (location_hash IN ( SELECT d2.location_hash
               FROM illegal_dumping_mobile d2
              WHERE (d2.reported_by = illegal_dumping_mobile.reported_by)
              GROUP BY d2.location_hash
             HAVING (count(*) > 1))) THEN 1
            ELSE NULL::integer
        END))::numeric * 100.0) / (NULLIF(count(*), 0))::numeric), 2) AS duplicate_percentage,
    max(created_at) AS last_report_date,
    min(created_at) AS first_report_date
   FROM illegal_dumping_mobile
  GROUP BY reported_by
  ORDER BY (count(*)) DESC;
