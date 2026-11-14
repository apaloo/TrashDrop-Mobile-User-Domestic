-- View public.illegal_dumping_reports
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: anon, authenticated, service_role
-- options: security_invoker=on

create view public.illegal_dumping_reports with (security_invoker=on) as
SELECT id,
    reported_by,
    assigned_to,
    location,
    address,
    description,
    waste_type,
    severity,
    status,
    images,
    created_at,
    updated_at
   FROM illegal_dumping;
