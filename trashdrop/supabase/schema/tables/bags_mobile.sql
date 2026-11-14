-- Table public.bags_mobile
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.bags_mobile (
  bag_id uuid not null default gen_random_uuid(),
  requested_at timestamp with time zone not null default now(),
  batch_id uuid not null default gen_random_uuid(),
  status text,
  picked_up_at timestamp without time zone,
  picked_up_by uuid
);
alter table public.bags_mobile add constraint bags_mobile_pkey PRIMARY KEY (bag_id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE
