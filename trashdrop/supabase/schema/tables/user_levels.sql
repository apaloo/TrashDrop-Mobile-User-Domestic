-- Table public.user_levels
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.user_levels (
  id bigint not null,
  name text not null,
  points_threshold integer not null,
  benefits text[],
  created_at timestamp with time zone default now()
);
alter table public.user_levels add constraint user_levels_pkey PRIMARY KEY (id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "user_levels_select" on public.user_levels as permissive for select to public
  using (true);
