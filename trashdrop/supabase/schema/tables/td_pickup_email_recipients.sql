-- Table public.td_pickup_email_recipients
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.td_pickup_email_recipients (
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);
alter table public.td_pickup_email_recipients add constraint td_pickup_email_recipients_pkey PRIMARY KEY (user_id);
alter table public.td_pickup_email_recipients add constraint td_pickup_email_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Row level security: on
-- anon: no access
-- authenticated: no access
-- service_role: DELETE,INSERT,SELECT,UPDATE
