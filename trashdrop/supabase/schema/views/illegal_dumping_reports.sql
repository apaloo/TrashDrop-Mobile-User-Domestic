-- View public.illegal_dumping_reports
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: anon, authenticated, service_role
-- options: security_invoker=on

create view public.illegal_dumping_reports with (security_invoker=on) as
SELECT illegal_dumping.id,
    illegal_dumping.reported_by,
    illegal_dumping.assigned_to,
    illegal_dumping.location,
    illegal_dumping.address,
    illegal_dumping.description,
    illegal_dumping.waste_type,
    illegal_dumping.severity,
    illegal_dumping.status,
    illegal_dumping.images,
    illegal_dumping.created_at,
    illegal_dumping.updated_at
   FROM illegal_dumping;
