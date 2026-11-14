-- View public.user_recent_activity
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: authenticated, service_role
-- options: security_barrier=true

create view public.user_recent_activity with (security_barrier=true) as
SELECT a.user_id,
    a.activity_type,
    a.description,
    a.points_earned,
    a.created_at,
    a.source_type,
    a.activity_id,
    a.sort_timestamp
   FROM user_recent_activity_all a
  WHERE (((a.user_id)::text = (auth.uid())::text) OR (CURRENT_USER <> ALL (ARRAY['anon'::name, 'authenticated'::name])));
