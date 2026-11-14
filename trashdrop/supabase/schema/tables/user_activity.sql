-- Table public.user_activity
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.user_activity (
  id uuid not null default uuid_generate_v4(),
  user_id uuid not null,
  activity_type text not null,
  description text not null,
  related_id uuid,
  points_impact integer default 0,
  created_at timestamp with time zone not null default now()
);
alter table public.user_activity add constraint user_activities_pkey PRIMARY KEY (id);
alter table public.user_activity add constraint user_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
CREATE INDEX idx_user_activity_user_id ON public.user_activity USING btree (user_id);
CREATE INDEX idx_user_activity_user_type_created ON public.user_activity USING btree (user_id, activity_type, created_at DESC);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Enable read access for authenticated users" on public.user_activity as permissive for select to public
  using ((auth.uid() = user_id));
create policy "Users can view their own activities" on public.user_activity as permissive for all to public
  using ((auth.uid() = user_id));
