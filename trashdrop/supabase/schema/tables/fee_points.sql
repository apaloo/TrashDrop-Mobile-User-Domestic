-- Table public.fee_points
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.fee_points (
  id uuid not null default uuid_generate_v4(),
  user_id uuid,
  points integer not null,
  request_id text,
  created_at timestamp with time zone default now()
);
alter table public.fee_points add constraint fee_points_pkey PRIMARY KEY (id);
alter table public.fee_points add constraint fee_points_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Users can view their own fee points" on public.fee_points as permissive for select to public
  using ((user_id = auth.uid()));
