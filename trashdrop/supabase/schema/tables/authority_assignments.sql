-- Table public.authority_assignments
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.authority_assignments (
  id text not null,
  location text not null,
  coordinates geography(Point,4326) not null,
  type text not null,
  priority text,
  payment text not null,
  estimated_time text,
  distance text,
  authority text,
  status text not null,
  collector_id uuid,
  accepted_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  cleanup_notes text
);
alter table public.authority_assignments add constraint authority_assignments_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id);
alter table public.authority_assignments add constraint authority_assignments_pkey PRIMARY KEY (id);
alter table public.authority_assignments add constraint authority_assignments_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
alter table public.authority_assignments add constraint authority_assignments_status_check CHECK ((status = ANY (ARRAY['available'::text, 'accepted'::text, 'completed'::text])));
CREATE INDEX idx_authority_assignments_collector_id ON public.authority_assignments USING btree (collector_id);
CREATE INDEX idx_authority_assignments_collector_status ON public.authority_assignments USING btree (collector_id, status);
CREATE INDEX idx_authority_assignments_status ON public.authority_assignments USING btree (status);
CREATE INDEX idx_authority_assignments_status_collector_null ON public.authority_assignments USING btree (status, collector_id) WHERE (collector_id IS NULL);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Allow service role full access" on public.authority_assignments as permissive for all to service_role
  using (true)
  with check (true);
create policy "Anyone can view available assignments" on public.authority_assignments as permissive for select to public
  using (((status = 'available'::text) OR (collector_id = auth.uid())));
create policy "authority_assignments_staff_insert" on public.authority_assignments as permissive for insert to authenticated
  with check (td_is_staff());
create policy "Collectors can update their accepted assignments" on public.authority_assignments as permissive for update to public
  using ((collector_id = auth.uid()));
create policy "Collectors can update their own assignments" on public.authority_assignments as permissive for update to authenticated
  using ((collector_id = auth.uid()))
  with check ((collector_id = auth.uid()));
create policy "Collectors can view only their own assignments" on public.authority_assignments as permissive for select to authenticated
  using ((collector_id = auth.uid()));

-- Triggers (run in name order)
CREATE TRIGGER require_active_collector_claim BEFORE INSERT OR UPDATE OF collector_id ON public.authority_assignments FOR EACH ROW EXECUTE FUNCTION enforce_active_collector_claim();
CREATE TRIGGER update_authority_assignments_timestamp BEFORE UPDATE ON public.authority_assignments FOR EACH ROW EXECUTE FUNCTION update_authority_assignment_timestamp();
CREATE TRIGGER update_authority_assignments_updated_at BEFORE UPDATE ON public.authority_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
