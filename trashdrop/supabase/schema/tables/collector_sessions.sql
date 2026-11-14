-- Table public.collector_sessions
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.collector_sessions (
  id uuid not null default gen_random_uuid(),
  collector_id uuid not null,
  filter_criteria jsonb,
  reserved_requests uuid[] default ARRAY[]::uuid[],
  session_start timestamp with time zone default now(),
  last_activity timestamp with time zone default now(),
  is_active boolean default true,
  expires_at timestamp with time zone default (now() + '24:00:00'::interval),
  status text default 'offline'::text,
  status_reason text,
  last_status_change timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.collector_sessions add constraint collector_sessions_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES collector_profiles(user_id) ON DELETE CASCADE;
alter table public.collector_sessions add constraint collector_sessions_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX collector_sessions_collector_id_key ON public.collector_sessions USING btree (collector_id);
CREATE INDEX idx_collector_sessions_expires_at ON public.collector_sessions USING btree (expires_at);
CREATE INDEX idx_collector_sessions_is_active ON public.collector_sessions USING btree (is_active);
CREATE INDEX idx_collector_sessions_status ON public.collector_sessions USING btree (status);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "collector_sessions_require_active_collector_insert" on public.collector_sessions as restrictive for insert to authenticated
  with check (is_active_collector(auth.uid()));
create policy "collector_sessions_require_active_collector_update" on public.collector_sessions as restrictive for update to authenticated
  using (is_active_collector(auth.uid()));
create policy "Collectors can insert their own sessions" on public.collector_sessions as permissive for insert to public
  with check (((auth.uid())::text = (collector_id)::text));
create policy "Collectors can update their own sessions" on public.collector_sessions as permissive for update to public
  using (((auth.uid())::text = (collector_id)::text));
create policy "Collectors can view their own sessions" on public.collector_sessions as permissive for select to public
  using (((auth.uid())::text = (collector_id)::text));
create policy "manage_own_sessions" on public.collector_sessions as permissive for all to authenticated
  using ((collector_id = auth.uid()));
