-- View public.user_recent_activity
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: authenticated, service_role
-- options: security_barrier=true

create view public.user_recent_activity with (security_barrier=true) as
SELECT user_id,
    activity_type,
    description,
    points_earned,
    created_at,
    source_type,
    activity_id,
    sort_timestamp
   FROM user_recent_activity_all a
  WHERE (((user_id)::text = (auth.uid())::text) OR (CURRENT_USER <> ALL (ARRAY['anon'::name, 'authenticated'::name])));
