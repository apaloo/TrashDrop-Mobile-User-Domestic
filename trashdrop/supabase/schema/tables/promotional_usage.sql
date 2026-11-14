-- Table public.promotional_usage
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.promotional_usage (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  max_requests integer not null default 5,
  used_count integer not null default 0,
  is_eligible boolean default (used_count < max_requests),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.promotional_usage add constraint promotional_usage_pkey PRIMARY KEY (id);
alter table public.promotional_usage add constraint promotional_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.promotional_usage add constraint uq_promotional_usage_user UNIQUE (user_id);
CREATE INDEX idx_promotional_usage_user_id ON public.promotional_usage USING btree (user_id);

-- Row level security: on
-- anon: SELECT
-- authenticated: SELECT
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "promotional_usage_select_own" on public.promotional_usage as permissive for select to authenticated
  using ((user_id = auth.uid()));
