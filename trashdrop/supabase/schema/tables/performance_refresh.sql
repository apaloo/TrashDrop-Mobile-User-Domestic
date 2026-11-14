-- Table public.performance_refresh
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.performance_refresh (
  id boolean not null default true,
  refreshed_at timestamp with time zone,
  took_ms integer,
  rows_written integer
);
alter table public.performance_refresh add constraint performance_refresh_id_check CHECK (id);
alter table public.performance_refresh add constraint performance_refresh_pkey PRIMARY KEY (id);

-- Row level security: on
-- anon: no access
-- authenticated: no access
-- service_role: DELETE,INSERT,SELECT,UPDATE
