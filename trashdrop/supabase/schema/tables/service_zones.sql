-- Table public.service_zones
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.service_zones (
  id uuid not null default gen_random_uuid(),
  name text not null,
  city text,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  center_lat double precision,
  center_lng double precision,
  radius_km double precision
);
alter table public.service_zones add constraint service_zones_name_key UNIQUE (name);
alter table public.service_zones add constraint service_zones_pkey PRIMARY KEY (id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "service_zones readable by signed-in users" on public.service_zones as permissive for select to authenticated
  using (true);
