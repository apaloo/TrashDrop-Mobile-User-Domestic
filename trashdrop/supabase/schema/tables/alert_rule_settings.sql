-- Table public.alert_rule_settings
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.alert_rule_settings (
  rule_key text not null,
  enabled boolean not null default true,
  params jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid
);
alter table public.alert_rule_settings add constraint alert_rule_settings_pkey PRIMARY KEY (rule_key);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "alert_rule_settings: admins change" on public.alert_rule_settings as permissive for update to authenticated
  using (td_is_staff())
  with check (td_is_staff());
create policy "alert_rule_settings: admins read" on public.alert_rule_settings as permissive for select to authenticated
  using (td_is_staff());
